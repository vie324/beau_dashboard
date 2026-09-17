"use server";

import { db } from "@/helper/lib/db";
import { getCurrentUser } from "@/helper/lib/auth";
import { getActiveShopId } from "@/helper/lib/shop-context";
import {
  getNotifications,
  type NotificationFeed,
} from "@/feature/notification/services/getNotifications";

export type FeedResult =
  | ({ ok: true } & NotificationFeed)
  | { ok: false; error: string };

export type NotificationActionResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * ベルのポーリング用。表示中の店舗の通知を取り直す。
 * revalidatePath は呼ばない（ポーリングのたびにページ全体を作り直さない）。
 */
export async function fetchNotifications(): Promise<FeedResult> {
  if (!(await getCurrentUser())) return { ok: false, error: "未認証です" };
  const shopId = await getActiveShopId();
  try {
    const feed = await getNotifications(shopId);
    return { ok: true, ...feed };
  } catch {
    return { ok: false, error: "通知の取得に失敗しました" };
  }
}

/** 引数なしで表示中店舗の未読をすべて既読にする。id 指定ならその1件だけ。 */
export async function markNotificationsRead(
  id?: number,
): Promise<NotificationActionResult> {
  if (!(await getCurrentUser())) return { ok: false, error: "未認証です" };
  const shopId = await getActiveShopId();
  try {
    await db.notification.updateMany({
      where: {
        shopId,
        readAt: null,
        ...(id != null ? { id } : {}),
      },
      data: { readAt: new Date() },
    });
  } catch {
    return { ok: false, error: "既読にできませんでした" };
  }
  return { ok: true };
}
