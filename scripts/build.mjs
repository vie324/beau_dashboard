// Resilient production build.
//
// - With a real DATABASE_URL: generate client, push schema, seed (once), build.
// - Without a database (DATABASE_URL unset): still build so the UI is viewable
//   on Vercel. prisma generate / next build only need a syntactically valid
//   URL; DB-backed pages simply won't work until DATABASE_URL is configured.
import { execSync } from "node:child_process";

const raw = (process.env.DATABASE_URL ?? "").trim();
const PLACEHOLDER =
  "postgresql://placeholder:placeholder@127.0.0.1:5432/placeholder";
const hasRealDb = raw.length > 0 && !raw.includes("placeholder");

if (!hasRealDb) {
  process.env.DATABASE_URL = PLACEHOLDER;
  console.log(
    "[beau] DATABASE_URL not set — building UI only. Set DATABASE_URL in " +
      "Vercel (Settings → Environment Variables) to enable login and data.",
  );
}

function run(cmd) {
  console.log(`[beau] $ ${cmd}`);
  execSync(cmd, { stdio: "inherit" });
}

run("npx prisma generate");

if (hasRealDb) {
  run("npx prisma db push --skip-generate");
  run("npx tsx prisma/seed.ts");
} else {
  console.log("[beau] Skipping prisma db push / seed (no database configured).");
}

run("npx next build");
