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

-- 2026-06: 物販機能（PR #72 / merchandise・在庫・注文・ポイント）
-- スキーマに Customer.pointsBalance / Shop のストアフロント設定 /
-- ProductCategory・Product・ProductReview・InventoryItem・StockMovement・
-- Order・OrderItem・PointTransaction を追加したが、本番は connection pooler
-- 経由で build 時の `prisma db push` がスキップされるため、これらが本番DBに
-- 反映されていない。結果、顧客一覧の getCustomers が存在しない
-- Customer.pointsBalance 列や Order テーブルを参照して P2022/P2021 で失敗し、
-- 顧客ページが「エラーが発生しました」になる（注文・商品・公開販売ページも同様）。
-- 下の DDL を Supabase SQL Editor で流すと解消する。すべて冪等。

-- Customer: 物販ポイント残高
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "pointsBalance" INTEGER NOT NULL DEFAULT 0;

-- Shop: ストアフロント（公開販売ページ）設定
ALTER TABLE "Shop" ADD COLUMN IF NOT EXISTS "storeSlug" TEXT;
ALTER TABLE "Shop" ADD COLUMN IF NOT EXISTS "storeActive" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Shop" ADD COLUMN IF NOT EXISTS "storeTitle" TEXT;
ALTER TABLE "Shop" ADD COLUMN IF NOT EXISTS "storeDescription" TEXT;
ALTER TABLE "Shop" ADD COLUMN IF NOT EXISTS "shippingFee" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Shop" ADD COLUMN IF NOT EXISTS "freeShippingThreshold" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Shop" ADD COLUMN IF NOT EXISTS "pointRatePercent" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Shop" ADD COLUMN IF NOT EXISTS "legalInfo" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Shop_storeSlug_key" ON "Shop"("storeSlug");

-- ProductCategory
CREATE TABLE IF NOT EXISTS "ProductCategory" (
  "id"         SERIAL PRIMARY KEY,
  "shopId"     INTEGER NOT NULL REFERENCES "Shop"("id") ON UPDATE CASCADE ON DELETE RESTRICT,
  "name"       TEXT NOT NULL,
  "sortNumber" INTEGER NOT NULL DEFAULT 0,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt"  TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS "ProductCategory_shopId_idx" ON "ProductCategory"("shopId");

-- Product
CREATE TABLE IF NOT EXISTS "Product" (
  "id"          SERIAL PRIMARY KEY,
  "shopId"      INTEGER NOT NULL REFERENCES "Shop"("id") ON UPDATE CASCADE ON DELETE RESTRICT,
  "categoryId"  INTEGER REFERENCES "ProductCategory"("id") ON UPDATE CASCADE ON DELETE SET NULL,
  "sku"         TEXT,
  "name"        TEXT NOT NULL,
  "description" TEXT,
  "price"       INTEGER NOT NULL DEFAULT 0,
  "cost"        INTEGER NOT NULL DEFAULT 0,
  "taxRate"     INTEGER NOT NULL DEFAULT 10,
  "imageUrls"   TEXT,
  "isPublic"    BOOLEAN NOT NULL DEFAULT true,
  "sortNumber"  INTEGER NOT NULL DEFAULT 0,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt"   TIMESTAMP(3)
);
CREATE UNIQUE INDEX IF NOT EXISTS "Product_shopId_sku_key" ON "Product"("shopId", "sku");
CREATE INDEX IF NOT EXISTS "Product_shopId_idx" ON "Product"("shopId");

-- ProductReview
CREATE TABLE IF NOT EXISTS "ProductReview" (
  "id"          SERIAL PRIMARY KEY,
  "shopId"      INTEGER NOT NULL REFERENCES "Shop"("id") ON UPDATE CASCADE ON DELETE RESTRICT,
  "productId"   INTEGER NOT NULL REFERENCES "Product"("id") ON UPDATE CASCADE ON DELETE RESTRICT,
  "authorName"  TEXT NOT NULL,
  "rating"      INTEGER NOT NULL,
  "title"       TEXT,
  "comment"     TEXT,
  "isPublished" BOOLEAN NOT NULL DEFAULT true,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt"   TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS "ProductReview_shopId_productId_idx" ON "ProductReview"("shopId", "productId");

-- InventoryItem（商品1件につき1行）
CREATE TABLE IF NOT EXISTS "InventoryItem" (
  "id"          SERIAL PRIMARY KEY,
  "shopId"      INTEGER NOT NULL REFERENCES "Shop"("id") ON UPDATE CASCADE ON DELETE RESTRICT,
  "productId"   INTEGER NOT NULL REFERENCES "Product"("id") ON UPDATE CASCADE ON DELETE RESTRICT,
  "quantity"    INTEGER NOT NULL DEFAULT 0,
  "safetyStock" INTEGER NOT NULL DEFAULT 0,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "InventoryItem_productId_key" ON "InventoryItem"("productId");
CREATE INDEX IF NOT EXISTS "InventoryItem_shopId_idx" ON "InventoryItem"("shopId");

-- StockMovement（入出庫台帳）
CREATE TABLE IF NOT EXISTS "StockMovement" (
  "id"        SERIAL PRIMARY KEY,
  "shopId"    INTEGER NOT NULL REFERENCES "Shop"("id") ON UPDATE CASCADE ON DELETE RESTRICT,
  "productId" INTEGER NOT NULL REFERENCES "Product"("id") ON UPDATE CASCADE ON DELETE RESTRICT,
  "type"      TEXT NOT NULL,
  "qty"       INTEGER NOT NULL,
  "reason"    TEXT,
  "orderId"   INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "StockMovement_shopId_productId_idx" ON "StockMovement"("shopId", "productId");

-- Order（注文）
CREATE TABLE IF NOT EXISTS "Order" (
  "id"              SERIAL PRIMARY KEY,
  "shopId"          INTEGER NOT NULL REFERENCES "Shop"("id") ON UPDATE CASCADE ON DELETE RESTRICT,
  "orderNo"         TEXT NOT NULL,
  "customerId"      INTEGER REFERENCES "Customer"("id") ON UPDATE CASCADE ON DELETE SET NULL,
  "buyerName"       TEXT NOT NULL,
  "buyerPhone"      TEXT,
  "buyerEmail"      TEXT,
  "buyerCode"       TEXT,
  "fulfillment"     TEXT NOT NULL DEFAULT 'pickup',
  "shippingAddress" TEXT,
  "paymentStatus"   TEXT NOT NULL DEFAULT 'pending',
  "status"          TEXT NOT NULL DEFAULT 'received',
  "subtotal"        INTEGER NOT NULL DEFAULT 0,
  "taxTotal"        INTEGER NOT NULL DEFAULT 0,
  "shippingFee"     INTEGER NOT NULL DEFAULT 0,
  "pointsUsed"      INTEGER NOT NULL DEFAULT 0,
  "pointsEarned"    INTEGER NOT NULL DEFAULT 0,
  "total"           INTEGER NOT NULL DEFAULT 0,
  "note"            TEXT,
  "stripeSessionId" TEXT,
  "stripePaymentId" TEXT,
  "paidAt"          TIMESTAMP(3),
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt"       TIMESTAMP(3)
);
CREATE UNIQUE INDEX IF NOT EXISTS "Order_orderNo_key" ON "Order"("orderNo");
CREATE UNIQUE INDEX IF NOT EXISTS "Order_stripeSessionId_key" ON "Order"("stripeSessionId");
CREATE INDEX IF NOT EXISTS "Order_shopId_createdAt_idx" ON "Order"("shopId", "createdAt");

-- OrderItem（注文明細）
CREATE TABLE IF NOT EXISTS "OrderItem" (
  "id"        SERIAL PRIMARY KEY,
  "orderId"   INTEGER NOT NULL REFERENCES "Order"("id") ON UPDATE CASCADE ON DELETE RESTRICT,
  "productId" INTEGER REFERENCES "Product"("id") ON UPDATE CASCADE ON DELETE SET NULL,
  "name"      TEXT NOT NULL,
  "unitPrice" INTEGER NOT NULL DEFAULT 0,
  "taxRate"   INTEGER NOT NULL DEFAULT 10,
  "qty"       INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- PointTransaction（ポイント台帳）
CREATE TABLE IF NOT EXISTS "PointTransaction" (
  "id"         SERIAL PRIMARY KEY,
  "shopId"     INTEGER NOT NULL REFERENCES "Shop"("id") ON UPDATE CASCADE ON DELETE RESTRICT,
  "customerId" INTEGER NOT NULL REFERENCES "Customer"("id") ON UPDATE CASCADE ON DELETE RESTRICT,
  "orderId"    INTEGER REFERENCES "Order"("id") ON UPDATE CASCADE ON DELETE SET NULL,
  "type"       TEXT NOT NULL,
  "points"     INTEGER NOT NULL,
  "reason"     TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "PointTransaction_shopId_customerId_idx" ON "PointTransaction"("shopId", "customerId");
