-- 手動マイグレーション（Supabase SQL Editor で実行）
--
-- 本番DBが connection pooler 経由で、ビルド時の `prisma db push` がスキップ
-- される構成のため、スキーマに列を足したときはここに DDL を追記し、
-- Supabase SQL Editor（または psql）で手動実行する。
--
-- すべて `IF NOT EXISTS` 等で冪等にしてあるので、再実行しても安全。

-- 2026-05: 予約カードの背景色（PR #63 / Appointment.cardColor）
-- これが未適用だと Prisma が存在しない列を参照し、P2022 で予約画面が
-- 「エラーが発生しました」になる。
ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "cardColor" TEXT;

-- 2026-05: 予約カードの色プリセット（名前付きで色を保存・再利用するため）
-- 予約モーダル / 設定画面「予約枠の色」タブの両方で使う。
-- 未適用だと予約ページや設定ページの保存・読み込みが失敗する。
CREATE TABLE IF NOT EXISTS "CardColorPreset" (
  "id"         SERIAL PRIMARY KEY,
  "shopId"     INTEGER NOT NULL REFERENCES "Shop"("id"),
  "name"       TEXT NOT NULL,
  "hexColor"   TEXT NOT NULL,
  "sortNumber" INTEGER NOT NULL DEFAULT 0,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt"  TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS "CardColorPreset_shopId_idx" ON "CardColorPreset"("shopId");
