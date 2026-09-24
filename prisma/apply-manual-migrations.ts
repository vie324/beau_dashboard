/**
 * prisma/manual-migrations.sql をデプロイ時に自動適用する。
 *
 * 背景: 本番DBが connection pooler 経由だと、ビルド時の `prisma db push` は
 * DDL が不安定なためスキップされる（scripts/build.mjs 参照）。その結果、
 * 列やテーブルを追加した PR をデプロイしても本番DBに反映されず、
 * Supabase の SQL Editor で手動実行するまで画面が壊れていた。
 *
 * このスクリプトは `prisma db push` のようなスキーマ差分検出は行わず、
 * 人が書いた冪等な DDL をそのまま1文ずつ流すだけなので、pooler 経由でも
 * 素直に通る（advisory lock も長いトランザクションも使わない）。
 *
 * 方針:
 *  - SQL はすべて IF NOT EXISTS 等で冪等。毎デプロイ実行して問題ない
 *  - 1文が失敗しても後続は続ける（各文は独立しているため）
 *  - どれだけ失敗してもビルドは落とさない。「UIは常にデプロイできる」という
 *    このリポジトリの方針に合わせ、警告を出して終了コード 0 で返す
 *    （未適用なら実行時ガードで機能を無効化して画面は開ける）
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { splitSqlStatements } from "../helper/utils/sqlStatements";

const SQL_PATH = join(process.cwd(), "prisma", "manual-migrations.sql");

/** 実行できない・する意味がない接続先か。 */
function unusableUrl(url: string): boolean {
  return url.trim().length === 0 || url.includes("placeholder");
}

/** ログ用に1行へ切り詰める。 */
function oneLine(text: string, max = 90): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

/** Prisma のエラーは複数行で長いので、原因が分かる範囲に縮める。 */
function reason(err: unknown): string {
  if (err instanceof Error) {
    const code = (err as { code?: string }).code;
    const msg = oneLine(err.message, 200) || err.name;
    return code ? `${code} ${msg}` : msg;
  }
  return oneLine(String(err), 200);
}

async function main() {
  // DDL は直接接続（DIRECT_URL）があればそちらを優先する。無ければ
  // 通常の DATABASE_URL（pooler 可）でそのまま流す。
  const url = (process.env.DIRECT_URL || process.env.DATABASE_URL || "").trim();
  if (unusableUrl(url)) {
    console.log(
      "[beau] 手動マイグレーション: DATABASE_URL 未設定のためスキップしました。",
    );
    return;
  }

  let sql: string;
  try {
    sql = readFileSync(SQL_PATH, "utf8");
  } catch (err) {
    console.warn(
      `[beau] ⚠️ 手動マイグレーション: ${SQL_PATH} を読めませんでした。スキップします。`,
      err instanceof Error ? err.message : err,
    );
    return;
  }

  const statements = splitSqlStatements(sql);
  if (statements.length === 0) {
    console.log("[beau] 手動マイグレーション: 実行する文がありません。");
    return;
  }

  const db = new PrismaClient({ datasources: { db: { url } } });
  let ok = 0;
  const failures: { stmt: string; message: string }[] = [];

  try {
    // 先に疎通を見る。DBに届かないときは54文すべてが同じ理由で失敗して
    // ログが埋まるだけなので、1行だけ警告して抜ける。
    try {
      await db.$queryRawUnsafe("SELECT 1");
    } catch (err) {
      console.warn(
        "[beau] ⚠️ 手動マイグレーション: データベースに接続できないためスキップしました。" +
          " ビルドは続行します。理由: " +
          reason(err),
      );
      return;
    }

    for (const stmt of statements) {
      try {
        await db.$executeRawUnsafe(stmt);
        ok += 1;
      } catch (err) {
        failures.push({ stmt: oneLine(stmt), message: reason(err) });
      }
    }
  } finally {
    await db.$disconnect().catch(() => {});
  }

  if (failures.length === 0) {
    console.log(
      `[beau] 手動マイグレーション: ${ok}/${statements.length} 文を適用しました（冪等なので既適用分は変更なし）。`,
    );
    return;
  }

  console.warn(
    `[beau] ⚠️ 手動マイグレーション: ${ok}/${statements.length} 文を適用、${failures.length} 文が失敗しました。` +
      " 未適用の機能は実行時に無効化されるため画面は開きますが、必要なら Supabase の SQL Editor で" +
      " prisma/manual-migrations.sql を実行してください。",
  );
  for (const f of failures.slice(0, 5)) {
    console.warn(`[beau]   - ${f.stmt}\n[beau]     → ${f.message}`);
  }
  if (failures.length > 5) {
    console.warn(`[beau]   … ほか ${failures.length - 5} 件`);
  }
}

main().catch((err) => {
  // ここに来てもビルドは落とさない。
  console.warn(
    "[beau] ⚠️ 手動マイグレーションの適用に失敗しました。ビルドは続行します。理由: " +
      (err instanceof Error ? err.message : String(err)),
  );
});
