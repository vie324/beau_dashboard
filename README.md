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

- **予約管理** `/reservation` — 店舗ごとのタイムライン、新規／編集／削除、ステータス管理、スタッフ重複予約の自動ブロック、日付ナビ。予約カードには患者名・患者No.・メモを表示
- **対応スタッフ** `/settings`（メニュー） — メニューごとに担当できるスタッフを限定。未設定なら全員対応。設定するとオンライン予約の空き（◎/×）・自動割当がその人だけになる
- **強制リンク** `/booking-links` — 公開予約ページ（`/book/<slug>`）の発行・編集。対象店舗／予約可能メニュー／リマインド設定／公開停止を slug 単位で制御
- **物販・EC** `/products` `/orders` — 商品・在庫・入出庫、注文管理、クーポン発行、販売ページ設定（送料・ポイント付与率・お知らせ・ヒーロー画像・ポイント利用の可否）
- **お客様向け販売ページ** `/shop/<storeSlug>` — おすすめ／人気ランキング／セール表示、検索・絞り込み、カート、会員確認（会員番号 or メール＋電話番号）によるポイント利用とマイページ（残高・ポイント履歴・注文履歴）、クーポン、店頭受取／配送、Stripe Checkout 決済（全額ポイント払いは決済なしで確定）
- **ポイント管理** `/customers` — 顧客ごとのポイント台帳・購入履歴、来院ポイント等の手動付与/減算。注文キャンセル・返金時は付与/利用ポイントを正味で自動巻き戻し
- 多店舗対応（ShopContext / cookie `beau_active_shop_id`）、Email+Password 認証、全テーブル soft delete

## スキーマ変更の反映（本番）

本番DBが connection pooler 経由の場合、ビルド時の `prisma db push` はスキップされます。
スキーマを変更した PR をデプロイする際は `prisma/manual-migrations.sql` の該当セクションを
Supabase SQL Editor で実行してください（すべて冪等）。

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
