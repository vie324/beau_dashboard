// Resilient production build — the UI must always deploy.
//
// Rules:
//  - prisma generate / next build only need a syntactically valid URL, so a
//    placeholder is injected when DATABASE_URL is missing.
//  - db push + seed are attempted only when a real DATABASE_URL is set, and
//    are NON-FATAL: if the database is unreachable/misconfigured we log a
//    warning and still build, so the interface is always viewable on Vercel.
//  - Only a real code/compile error (next build) fails the deployment.
import { execSync } from "node:child_process";

const raw = (process.env.DATABASE_URL ?? "").trim();
const PLACEHOLDER =
  "postgresql://placeholder:placeholder@127.0.0.1:5432/placeholder";
const hasDbUrl = raw.length > 0 && !raw.includes("placeholder");

if (!hasDbUrl) {
  process.env.DATABASE_URL = PLACEHOLDER;
  console.log(
    "[beau] No DATABASE_URL set — building UI only. Set a valid DATABASE_URL " +
      "in Vercel (Settings → Environment Variables) to enable login and data.",
  );
}

function run(cmd) {
  console.log(`[beau] $ ${cmd}`);
  execSync(cmd, { stdio: "inherit" });
}

run("npx prisma generate");

if (hasDbUrl) {
  try {
    run("npx prisma db push --skip-generate");
    run("npx tsx prisma/seed.ts");
    console.log("[beau] Database is ready (schema synced + seeded).");
  } catch (err) {
    console.warn(
      "[beau] WARNING: database setup failed — continuing with a UI-only " +
        "build. Login and data features will not work until DATABASE_URL " +
        "points to a reachable database. Reason: " +
        (err?.message ?? String(err)),
    );
  }
} else {
  console.log("[beau] Skipping prisma db push / seed (no database configured).");
}

run("npx next build");
