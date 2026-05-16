// Ensures the local SQLite database exists and is seeded.
// Idempotent: if prisma/dev.db already exists, this is a no-op (your data is kept).
// Runs automatically before `npm run dev` / `npm start` so a fresh clone "just works".
import { existsSync } from "node:fs";
import { execSync } from "node:child_process";

const DB_PATH = "prisma/dev.db";

if (existsSync(DB_PATH)) {
  process.exit(0);
}

console.log("[beau] Local database not found — creating and seeding…");
try {
  execSync("npx prisma db push --skip-generate", { stdio: "inherit" });
  execSync("npx tsx prisma/seed.ts", { stdio: "inherit" });
  console.log("[beau] Database ready. Login: admin@beau.test / beau1234");
} catch (err) {
  console.error("[beau] Database setup failed:", err?.message ?? err);
  process.exit(1);
}
