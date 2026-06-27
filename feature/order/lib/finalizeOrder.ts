import "server-only";
import { db } from "@/helper/lib/db";

/**
 * 決済成立時の注文確定処理（Stripe webhook から呼ぶ）。
 * 在庫はチェックアウト時（createCheckout）に「予約」として既に引き当て済みなので、
 * ここでは在庫を減算しない。やることは:
 *   1. 原子的な確定権の取得（pending のときだけ paid 化）→ 二重実行防止
 *   2. 既存顧客の解決 or 新規作成（会員番号 > メール > 電話 で突合）し注文に紐付け
 *   3. ポイント付与（PointTransaction + Customer.pointsBalance 更新）
 *
 * 冪等: 同じイベントが複数回届いても、確定権を取れた1回だけが副作用を実行する。
 */
export async function finalizeOrderPaid(
  orderId: number,
  stripePaymentId: string | null,
): Promise<void> {
  await db.$transaction(async (tx) => {
    // pending の行だけを paid に更新できる。並行/再送 webhook では2回目以降 count=0。
    const claim = await tx.order.updateMany({
      where: { id: orderId, paymentStatus: "pending", deletedAt: null },
      data: {
        paymentStatus: "paid",
        status: "received",
        paidAt: new Date(),
        stripePaymentId,
      },
    });
    if (claim.count === 0) return; // 既に確定済み / 取消済み

    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order) return;
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
        // ソフトデリート済みの同一 code が残っていると @@unique([shopId, code])
        // 違反になり得るため、衝突したら code 無しで作成してトランザクション全体の
        // ロールバック（＝決済確定の永久失敗）を避ける。
        try {
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
        } catch {
          const created = await tx.customer.create({
            data: {
              shopId,
              name: order.buyerName,
              phone: order.buyerPhone,
              email: order.buyerEmail,
              note: "物販より自動登録",
            },
            select: { id: true },
          });
          customerId = created.id;
        }
      }
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

    // 顧客の紐付けを確定（在庫は予約済みのため触らない）
    await tx.order.update({
      where: { id: order.id },
      data: { customerId },
    });
  });
}

/**
 * 予約在庫の解放（決済失効・失敗・セッション作成失敗時）。
 * pending の注文だけを cancelled にし、引き当て済み在庫を戻してソフトデリートする。
 * 冪等: pending を取れた1回だけ実行。paid/cancelled には何もしない。
 */
export async function releaseOrderStock(
  orderId: number,
  finalPaymentStatus: "cancelled" | "refunded" = "cancelled",
): Promise<void> {
  await db.$transaction(async (tx) => {
    const claim = await tx.order.updateMany({
      where: { id: orderId, paymentStatus: "pending", deletedAt: null },
      data: {
        status: "cancelled",
        paymentStatus: finalPaymentStatus,
        deletedAt: new Date(),
      },
    });
    if (claim.count === 0) return;

    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order) return;

    for (const item of order.items) {
      if (!item.productId) continue;
      await tx.inventoryItem.updateMany({
        where: { productId: item.productId, shopId: order.shopId },
        data: { quantity: { increment: item.qty } },
      });
      await tx.stockMovement.create({
        data: {
          shopId: order.shopId,
          productId: item.productId,
          type: "adjust",
          qty: item.qty,
          reason: `予約解放 ${order.orderNo}`,
          orderId: order.id,
        },
      });
    }
  });
}
