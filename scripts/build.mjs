// Resilient production build — the UI must always deploy.
//
// Rules:
//  - prisma generate / next build only need a syntactically valid URL, so a
//    placeholder is injected when DATABASE_URL is missing.
//  - db push + seed are attempted only when a real DATABASE_URL is set, and
//    are NON-FATAL: if the database is unreachable/misconfigured we log a
//    warning and still build, so the interface is always viewable on Vercel.
//  - When DATABASE_URL is a connection pooler (PgBouncer / Supavisor
//    transaction mode), DDL is not reliably supported and `prisma db push`
//    can hang — in that case we skip schema sync entirely and rely on
//    out-of-band schema management (Supabase SQL Editor, etc.). To re-enable
//    build-time schema sync, set DIRECT_URL to a Session pooler or direct
//    connection string.
//  - Only a real code/compile error (next build) fails the deployment.
import { execSync } from "node:child_process";

const raw = (process.env.DATABASE_URL ?? "").trim();
const direct = (process.env.DIRECT_URL ?? "").trim();
const PLACEHOLDER =
  "postgresql://placeholder:placeholder@127.0.0.1:5432/placeholder";
const hasDbUrl = raw.length > 0 && !raw.includes("placeholder");
const isPooler =
  raw.includes("pooler.supabase.com") || raw.includes("pgbouncer=true");

if (!hasDbUrl) {
  process.env.DATABASE_URL = PLACEHOLDER;
  console.log(
    "[beau] No DATABASE_URL set — building UI only. Set a valid DATABASE_URL " +
      "in Vercel (Settings → Environment Variables) to enable login and data.",
  );
}

function run(cmd, env) {
  console.log(`[beau] $ ${cmd}`);
  execSync(cmd, { stdio: "inherit", env: env ?? process.env });
}

run("npx prisma generate");

if (hasDbUrl) {
  if (isPooler && !direct) {
    // Pooler 経由では DDL が不安定なため schema sync をスキップ。
    // スキーマは Supabase SQL Editor で管理するか、DIRECT_URL を設定する。
    console.log(
      "[beau] DATABASE_URL is a connection pooler (PgBouncer/Supavisor). " +
        "Skipping `prisma db push` and seed — DDL is unreliable through the " +
        "transaction pooler. Manage schema via Supabase SQL Editor, or set " +
        "DIRECT_URL (Session pooler / direct connection) to re-enable schema " +
        "sync at build time.",
    );
  } else {
    const pushEnv = direct
      ? { ...process.env, DATABASE_URL: direct }
      : process.env;
    try {
      run("npx prisma db push --skip-generate", pushEnv);
      run("npx tsx prisma/seed.ts", pushEnv);
      console.log("[beau] Database is ready (schema synced + seeded).");
    } catch (err) {
      console.warn(
        "[beau] WARNING: database setup failed — continuing with a UI-only " +
          "build. Login and data features will not work until DATABASE_URL " +
          "points to a reachable database. Reason: " +
          (err?.message ?? String(err)),
      );
    }
  }
} else {
  console.log("[beau] Skipping prisma db push / seed (no database configured).");
}

run("npx next build");
