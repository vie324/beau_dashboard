import { describe, expect, it } from "vitest";
import { splitSqlStatements } from "@/helper/utils/sqlStatements";

describe("splitSqlStatements", () => {
  it("セミコロンで分割する", () => {
    expect(splitSqlStatements("SELECT 1; SELECT 2;")).toEqual([
      "SELECT 1",
      "SELECT 2",
    ]);
  });

  it("末尾にセミコロンが無い文も拾う", () => {
    expect(splitSqlStatements("SELECT 1")).toEqual(["SELECT 1"]);
  });

  it("空・コメントだけの塊は返さない", () => {
    expect(splitSqlStatements("")).toEqual([]);
    expect(splitSqlStatements("  \n\n  ")).toEqual([]);
    expect(splitSqlStatements("-- コメントのみ\n")).toEqual([]);
    expect(splitSqlStatements("SELECT 1;\n-- 末尾コメント\n")).toEqual([
      "SELECT 1",
    ]);
  });

  it("行コメントを取り除く", () => {
    expect(splitSqlStatements("-- 説明\nSELECT 1; -- 後ろのメモ\nSELECT 2;")).toEqual([
      "SELECT 1",
      "SELECT 2",
    ]);
  });

  it("ブロックコメントを取り除く", () => {
    expect(splitSqlStatements("/* 説明 */ SELECT 1;")).toEqual(["SELECT 1"]);
  });

  it("文字列リテラル内のセミコロンでは切らない", () => {
    expect(splitSqlStatements("SELECT 'a;b'; SELECT 2;")).toEqual([
      "SELECT 'a;b'",
      "SELECT 2",
    ]);
  });

  it("文字列内の '' エスケープを正しく扱う", () => {
    expect(splitSqlStatements("SELECT 'it''s; ok'; SELECT 2;")).toEqual([
      "SELECT 'it''s; ok'",
      "SELECT 2",
    ]);
  });

  it("文字列リテラル内の -- をコメント扱いしない", () => {
    expect(splitSqlStatements("SELECT '-- not a comment'; SELECT 2;")).toEqual([
      "SELECT '-- not a comment'",
      "SELECT 2",
    ]);
  });

  it("DO $$ ... END $$; の内側のセミコロンでは切らない", () => {
    const sql = `
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'x_fkey') THEN
    ALTER TABLE "Order" ADD CONSTRAINT "x_fkey" FOREIGN KEY ("a") REFERENCES "B"("id");
  END IF;
END $$;
SELECT 1;
`;
    const out = splitSqlStatements(sql);
    expect(out).toHaveLength(2);
    expect(out[0].startsWith("DO $$")).toBe(true);
    expect(out[0].endsWith("END $$")).toBe(true);
    expect(out[0]).toContain("END IF;");
    expect(out[1]).toBe("SELECT 1");
  });

  it("タグ付きドル引用符も扱える", () => {
    const sql = "DO $tag$ BEGIN; END $tag$; SELECT 1;";
    expect(splitSqlStatements(sql)).toEqual([
      "DO $tag$ BEGIN; END $tag$",
      "SELECT 1",
    ]);
  });
});
