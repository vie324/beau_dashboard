"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/helper/lib/db";
import { getActiveShopId } from "@/helper/lib/shop-context";
import { getCurrentUser } from "@/helper/lib/auth";

export type ActionResult = { ok: true } | { ok: false; error: string };

const ALLOWED_STATUS = [
  "received",
  "preparing",
  "ready",
  "completed",
  "cancelled",
] as const;

export async function updateOrderStatus(
  id: number,
  status: string,
): Promise<ActionResult> {
  if (!(await getCurrentUser())) return { ok: false, error: "未認証です" };
  if (!ALLOWED_STATUS.includes(status as (typeof ALLOWED_STATUS)[number])) {
    return { ok: false, error: "不正なステータスです" };
  }
  const shopId = await getActiveShopId();
  const order = await db.order.findFirst({
    where: { id, shopId, deletedAt: null },
    select: { id: true },
  });
  if (!order) return { ok: false, error: "注文が見つかりません" };

  try {
    await db.order.update({ where: { id }, data: { status } });
  } catch {
    return { ok: false, error: "更新に失敗しました" };
  }
  revalidatePath("/orders");
  return { ok: true };
}

/**
 * 注文キャンセル。在庫はチェックアウト時に予約済みなので、未発送・決済済みに
 * 関わらず引き当て済み在庫を戻す。決済済みなら付与済みポイントも取り消す。
 * （Stripe 側の返金は管理者がダッシュボードで実施する想定。ここでは社内データの
 *  整合のみ行い paymentStatus を refunded にする。）
 * 原子的: status が cancelled でない行を1回だけ確定し、二重取消を防ぐ。
 */
export async function cancelOrder(id: number): Promise<ActionResult> {
  if (!(await getCurrentUser())) return { ok: false, error: "未認証です" };
  const shopId = await getActiveShopId();

  try {
    await db.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id, shopId, deletedAt: null },
        include: { items: true, pointTransactions: true },
      });
      if (!order) throw new Error("注文が見つかりません");

      const wasPaid = order.paymentStatus === "paid";

      // cancelled でない行だけを取消に遷移（取れた1回だけが副作用を実行）
      const claim = await tx.order.updateMany({
        where: { id, shopId, status: { not: "cancelled" }, deletedAt: null },
        data: {
          status: "cancelled",
          paymentStatus: wasPaid ? "refunded" : "cancelled",
        },
      });
      if (claim.count === 0) return; // 既に取消済み

      // 予約在庫を戻す（competition-safe な increment）
      for (const item of order.items) {
        if (!item.productId) continue;
        await tx.inventoryItem.updateMany({
          where: { productId: item.productId, shopId },
          data: { quantity: { increment: item.qty } },
        });
        await tx.stockMovement.create({
          data: {
            shopId,
            productId: item.productId,
            type: "adjust",
            qty: item.qty,
            reason: `注文取消 ${order.orderNo}`,
            orderId: order.id,
          },
        });
      }

      // 付与済みポイントの取消（earn の正味分を戻す）
      const earned = order.pointTransactions
        .filter((t) => t.type === "earn")
        .reduce((s, t) => s + t.points, 0);
      if (earned > 0 && order.customerId) {
        await tx.pointTransaction.create({
          data: {
            shopId,
            customerId: order.customerId,
            orderId: order.id,
            type: "adjust",
            points: -earned,
            reason: `注文取消 ${order.orderNo}`,
          },
        });
        await tx.customer.update({
          where: { id: order.customerId },
          data: { pointsBalance: { decrement: earned } },
        });
      }
    });
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "取消に失敗しました",
    };
  }
  revalidatePath("/orders");
  revalidatePath("/products");
  return { ok: true };
}
