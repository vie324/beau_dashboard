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
//    can hang — in that case we skip `db push` and instead apply
//    prisma/manual-migrations.sql, which is hand-written idempotent DDL and
//    goes through a pooler fine (single statements, no advisory locks).
//    Set DIRECT_URL (Session pooler / direct connection) to also get the
//    full `prisma db push` schema sync at build time.
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

/**
 * 手書きの冪等 DDL を適用する。スクリプト側で失敗を握りつぶすので
 * ここが原因でビルドが落ちることはないが、念のため二重に守っておく。
 */
function applyManualMigrations(env) {
  try {
    run("npx tsx prisma/apply-manual-migrations.ts", env);
  } catch (err) {
    console.warn(
      "[beau] WARNING: could not apply prisma/manual-migrations.sql — " +
        "continuing the build. Reason: " + (err?.message ?? String(err)),
    );
  }
}

run("npx prisma generate");

if (hasDbUrl) {
  if (isPooler && !direct) {
    // Pooler 経由では `prisma db push` の DDL が不安定なのでスキップする。
    // 代わりに prisma/manual-migrations.sql（人が書いた冪等な DDL）を流す。
    // こちらは単発の文を順に実行するだけなので pooler でも問題なく通り、
    // 「列を足した PR をデプロイしたのに本番DBに反映されない」を防げる。
    console.warn(
      "[beau] DATABASE_URL is a connection pooler (PgBouncer/Supavisor). " +
        "Skipping `prisma db push` (DDL is unreliable through the transaction " +
        "pooler) and applying prisma/manual-migrations.sql instead. " +
        "Set DIRECT_URL (Session pooler / direct connection) for full schema sync.",
    );
    applyManualMigrations(process.env);
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
      // db push が落ちた場合も、手書きの冪等 DDL だけは当ててみる。
      applyManualMigrations(pushEnv);
    }
  }
} else {
  console.log("[beau] Skipping prisma db push / seed (no database configured).");
}

run("npx next build");
