# Beau — サロン予約管理ダッシュボード

整骨院・整体・エステなどのサロン向け予約管理システム。
**Next.js (App Router) + TypeScript + Prisma/PostgreSQL** で構築。Vercel にそのままデプロイできます。

## デプロイ（Vercel）

1. ホスト型 PostgreSQL を用意（[Neon](https://neon.tech) 無料枠など）し、**接続文字列**を取得
2. Vercel でこのリポジトリを Import
3. Project → Settings → Environment Variables に `DATABASE_URL`（上の接続文字列）を追加
4. Deploy。`build` 時に `prisma db push` でテーブル作成、初回のみシード投入されます

ログイン: `admin@beau.test` / `beau1234`

## ローカル開発

```bash
npm install
echo 'DATABASE_URL="postgresql://..."' > .env.local   # ホスト型PostgreSQLの接続文字列
npm run db:reset   # テーブル作成 + シード
npm run dev        # http://localhost:3000
```

> 画面が真っ白なときは、(1) `npm install` が正常終了しているか、(2) ターミナルに
> `✓ Ready` / `✓ Compiled` が出てから開いているか（初回コンパイルは数秒かかります）、
> (3) ブラウザを再読み込み（キャッシュ無効）したか、を確認してください。

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

技術スタック・開発ルールの詳細は元プロジェクト概要に準拠（Supabase の代わりに Prisma/PostgreSQL を採用）。
