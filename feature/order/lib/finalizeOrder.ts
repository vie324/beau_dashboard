import "server-only";
import { db } from "@/helper/lib/db";

/**
 * 決済成立時の注文確定処理（Stripe webhook から呼ぶ）。
 *  1. 二重実行を防止（既に paid なら何もしない）
 *  2. 在庫引当（StockMovement out + InventoryItem 減算）
 *  3. 既存顧客の解決 or 新規作成（会員番号 > メール > 電話 で突合）し注文に紐付け
 *  4. ポイント付与（PointTransaction + Customer.pointsBalance 更新）
 *
 * すべて1トランザクション。冪等。
 */
export async function finalizeOrderPaid(
  orderId: number,
  stripePaymentId: string | null,
): Promise<void> {
  await db.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order) return;
    if (order.paymentStatus === "paid") return; // 冪等: 既に確定済み

    const shopId = order.shopId;

    // --- 顧客の解決 / 作成 ---
    let customerId = order.customerId ?? null;
    if (!customerId) {
      let found =
        order.buyerCode
          ? await tx.customer.findFirst({
              where: { shopId, code: order.buyerCode, deletedAt: null },
              select: { id: true },
            })
          : null;
      if (!found && order.buyerEmail) {
        found = await tx.customer.findFirst({
          where: { shopId, email: order.buyerEmail, deletedAt: null },
          select: { id: true },
        });
      }
      if (!found && order.buyerPhone) {
        found = await tx.customer.findFirst({
          where: { shopId, phone: order.buyerPhone, deletedAt: null },
          select: { id: true },
        });
      }
      if (found) {
        customerId = found.id;
      } else {
        const created = await tx.customer.create({
          data: {
            shopId,
            name: order.buyerName,
            phone: order.buyerPhone,
            email: order.buyerEmail,
            code: order.buyerCode,
            note: "物販より自動登録",
          },
          select: { id: true },
        });
        customerId = created.id;
      }
    }

    // --- 在庫引当 ---
    for (const item of order.items) {
      if (!item.productId) continue;
      const inv = await tx.inventoryItem.findFirst({
        where: { productId: item.productId, shopId },
      });
      if (!inv) continue;
      await tx.inventoryItem.update({
        where: { id: inv.id },
        data: { quantity: inv.quantity - item.qty },
      });
      await tx.stockMovement.create({
        data: {
          shopId,
          productId: item.productId,
          type: "out",
          qty: -item.qty,
          reason: `注文 ${order.orderNo}`,
          orderId: order.id,
        },
      });
    }

    // --- ポイント付与 ---
    const earned = order.pointsEarned;
    if (earned > 0 && customerId) {
      await tx.pointTransaction.create({
        data: {
          shopId,
          customerId,
          orderId: order.id,
          type: "earn",
          points: earned,
          reason: `注文 ${order.orderNo}`,
        },
      });
      await tx.customer.update({
        where: { id: customerId },
        data: { pointsBalance: { increment: earned } },
      });
    }

    // --- 注文を確定 ---
    await tx.order.update({
      where: { id: order.id },
      data: {
        paymentStatus: "paid",
        status: "received",
        paidAt: new Date(),
        stripePaymentId,
        customerId,
      },
    });
  });
}
