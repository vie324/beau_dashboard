"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/helper/lib/db";
import { getActiveShopId } from "@/helper/lib/shop-context";
import { getCurrentUser } from "@/helper/lib/auth";

export type ActionResult = { ok: true } | { ok: false; error: string };

// 「cancelled」は含めない。取消は在庫戻し・ポイント取消・原子的ガードを備えた
// cancelOrder のみが担う。updateOrderStatus 経由の素の cancelled 化を禁止する。
const ALLOWED_STATUS = ["received", "preparing", "ready", "completed"] as const;

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
      // --- 原子的な確定権の取得（read-then-act 競合の回避）---
      // paymentStatus 別の条件付き updateMany で取消権を取り、確定値から副作用を算出する。
      // これにより finalizeOrderPaid（pending→paid）と競合しても、paymentStatus を
      // pending のまま残さず（後追いの paid 付与を防止）、paid 済みなら refunded に遷移する。
      //
      // 2文（paid 用 / pending 用）の間に finalize が pending→paid をコミットすると
      // 両方 0 件になり得る（キャンセル消失窓）。その場合は現在値を読み直し、paid へ
      // 遷移していれば paid 経路を再試行してこの窓を塞ぐ（最大3回）。
      let claimed = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        const claimPaid = await tx.order.updateMany({
          where: {
            id,
            shopId,
            deletedAt: null,
            status: { not: "cancelled" },
            paymentStatus: "paid",
          },
          data: { status: "cancelled", paymentStatus: "refunded" },
        });
        if (claimPaid.count > 0) {
          claimed = true;
          break;
        }
        const claimUnpaid = await tx.order.updateMany({
          where: {
            id,
            shopId,
            deletedAt: null,
            status: { not: "cancelled" },
            paymentStatus: "pending",
          },
          data: { status: "cancelled", paymentStatus: "cancelled" },
        });
        if (claimUnpaid.count > 0) {
          claimed = true;
          break;
        }
        // 両方 0: 既に取消/返金済み、または直前に paid 化された。現在値を確認。
        const cur = await tx.order.findUnique({
          where: { id },
          select: { status: true, paymentStatus: true },
        });
        if (!cur || cur.status === "cancelled") break; // 既に終端
        if (cur.paymentStatus !== "paid") break; // pending でも paid でもない → 対象外
        // paid に遷移していた → 次ループの claimPaid が成功する
      }
      if (!claimed) {
        return; // 既に取消/返金済み、または確定不能
      }

      const order = await tx.order.findUnique({
        where: { id },
        include: { items: true, pointTransactions: true },
      });
      if (!order) return;

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
