import "server-only";
import { db } from "@/helper/lib/db";

/**
 * 「本番DBに手動マイグレーションが適用済みか」を実行時に判定する。
 *
 * 本番は connection pooler 経由でビルド時の `prisma db push` がスキップされる
 * ため、prisma/manual-migrations.sql を SQL Editor で流すまで新しい列・テーブルが
 * 存在しない。Prisma は存在しない列を SELECT すると P2022 で失敗し、
 * 画面全体がエラー境界に落ちてしまう。
 *
 * そこで参照前にここで存在確認し、未適用なら「その機能だけ無効」として
 * 画面自体は開けるようにする。
 *
 * 判定結果は true になったときだけキャッシュする（適用した DDL は消えないため）。
 * false のときは毎回問い合わせるので、SQL を流せば再デプロイなしで有効になる。
 */

let notifySupport: boolean | null = null;

export type NotifySupport = {
  /** Shop.notifyEmail / notifyManualBooking が存在する */
  columns: boolean;
  /** Notification テーブルが存在する */
  table: boolean;
  /** 通知機能が一通り使える（列もテーブルもある） */
  ready: boolean;
};

/**
 * 予約・キャンセル通知に必要なスキーマが揃っているか。
 * 接続不能などで判定自体に失敗した場合は「未適用」として扱い、
 * 通知まわりを無効化して画面を守る（接続不能なら結局どのみち描画できない）。
 */
export async function getNotifySupport(): Promise<NotifySupport> {
  if (notifySupport) return { columns: true, table: true, ready: true };

  try {
    const [row] = await db.$queryRaw<
      { columns: number; table_exists: boolean }[]
    >`
      SELECT
        (
          SELECT COUNT(*)::int
          FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'Shop'
            AND column_name IN ('notifyEmail', 'notifyManualBooking')
        ) AS "columns",
        (to_regclass('"Notification"') IS NOT NULL) AS "table_exists"
    `;
    const columns = Number(row?.columns ?? 0) === 2;
    const table = row?.table_exists === true;
    const ready = columns && table;
    if (ready) notifySupport = true;
    return { columns, table, ready };
  } catch {
    return { columns: false, table: false, ready: false };
  }
}
