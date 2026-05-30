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
