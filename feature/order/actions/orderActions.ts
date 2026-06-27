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
 * 注文キャンセル。決済済みの場合は在庫を戻し、付与済みポイントを取消す。
 * （Stripe 側の返金は管理者がダッシュボードで実施する想定。ここでは
 *  社内データの整合のみ行い paymentStatus を refunded にする。）
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
      if (order.status === "cancelled") return;

      const wasPaid = order.paymentStatus === "paid";

      if (wasPaid) {
        // 在庫を戻す
        for (const item of order.items) {
          if (!item.productId) continue;
          const inv = await tx.inventoryItem.findFirst({
            where: { productId: item.productId, shopId },
          });
          if (!inv) continue;
          await tx.inventoryItem.update({
            where: { id: inv.id },
            data: { quantity: inv.quantity + item.qty },
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
        // ポイント取消（付与分をマイナス計上）
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
      }

      await tx.order.update({
        where: { id },
        data: {
          status: "cancelled",
          paymentStatus: wasPaid ? "refunded" : "cancelled",
        },
      });
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
