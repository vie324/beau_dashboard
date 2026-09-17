import { db } from "@/helper/lib/db";

export type NotificationRow = {
  id: number;
  /** "reservation" | "cancel" */
  type: string;
  title: string;
  body: string;
  /** 予約の開始日時（ISO）。無い場合は null。 */
  startAt: string | null;
  /** 通知が作られた日時（ISO）。 */
  createdAt: string;
  read: boolean;
};

export type NotificationFeed = {
  items: NotificationRow[];
  unread: number;
};

/** 一覧に出す最大件数。ベルのドロップダウンに収まる程度。 */
export const NOTIFICATION_LIMIT = 30;

/** 表示中の店舗の通知（新しい順）と未読件数。 */
export async function getNotifications(
  shopId: number,
  limit: number = NOTIFICATION_LIMIT,
): Promise<NotificationFeed> {
  const [rows, unread] = await Promise.all([
    db.notification.findMany({
      where: { shopId },
      orderBy: { id: "desc" },
      take: limit,
      select: {
        id: true,
        type: true,
        title: true,
        body: true,
        startAt: true,
        createdAt: true,
        readAt: true,
      },
    }),
    db.notification.count({ where: { shopId, readAt: null } }),
  ]);

  return {
    items: rows.map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      body: r.body,
      // Date のままクライアントに渡さず ISO 文字列に寄せる（表示は JST で整形）。
      startAt: r.startAt ? r.startAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
      read: r.readAt != null,
    })),
    unread,
  };
}
