# Beau — サロン予約管理ダッシュボード

整骨院・整体・エステなどのサロン向け予約管理システム。
**Next.js (App Router) + TypeScript + Prisma/SQLite** で構築（外部サービス不要、clone してすぐ動きます）。

## クイックスタート

```bash
npm install
cp .env.example .env          # 既に .env があれば不要
npm run db:reset              # SQLite 作成 + シード投入
npm run dev                   # http://localhost:3000
```

ログイン: `admin@beau.test` / `beau1234`

## 実装済み機能

- **予約管理** `/reservation` — 店舗ごとのタイムライン、新規／編集／削除、ステータス管理、スタッフ重複予約の自動ブロック、日付ナビ
- **強制リンク** `/booking-links` — 公開予約ページ（`/book/<slug>`）の発行・編集。対象店舗／予約可能メニュー／リマインド設定／公開停止を slug 単位で制御
- 多店舗対応（ShopContext / cookie `beau_active_shop_id`）、Email+Password 認証、全テーブル soft delete

## コマンド

```bash
npm run dev        # 開発サーバー
npm run build      # プロダクションビルド
npm run lint       # ESLint
npm run typecheck  # 型チェックのみ
npm run db:reset   # DB 初期化 + シード
```

## 主要ディレクトリ

```
app/                ルーティング・ページ ((auth)/(dashboard)/book)
feature/[name]/     actions(Server Actions) / services(Read) / schema(zod) / components
components/         共通UI(ui) / レイアウト(layout)
helper/lib/         db, auth, shop-context
helper/utils/       time(Asia/Tokyo), status, cn
prisma/             schema.prisma, seed.ts
```

技術スタック・開発ルールの詳細は元プロジェクト概要に準拠（Supabase の代わりに Prisma/SQLite を採用）。
