import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/helper/lib/db";

type Tx = Prisma.TransactionClient;

type OrderForReversal = {
  id: number;
  shopId: number;
  orderNo: string;
  customerId: number | null;
  couponId: number | null;
  items: { productId: number | null; qty: number }[];
  pointTransactions: { points: number }[];
};

const reversalInclude = {
  items: { select: { productId: true, qty: true } },
  pointTransactions: { select: { points: true } },
} as const;

/** 注文明細ぶんの在庫を戻す（competition-safe な increment）。 */
async function restockOrderItems(
  tx: Tx,
  order: OrderForReversal,
  reasonLabel: string,
): Promise<void> {
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
        reason: `${reasonLabel} ${order.orderNo}`,
        orderId: order.id,
      },
    });
  }
}

/**
 * この注文が顧客ポイントに与えた影響（付与・利用の正味）を打ち消す。
 *   例: 付与 +280 / 利用 -500 → 正味 -220 → 補正 +220（残高が注文前の状態に戻る）
 * 取消・返金・予約解放のどの経路でも同じ関数で戻すので、二重に戻ることはない
 * （呼び出し側が原子的に確定権を取った1回だけ呼ぶ）。
 */
async function reverseOrderPoints(
  tx: Tx,
  order: OrderForReversal,
  reasonLabel: string,
): Promise<void> {
  if (!order.customerId) return;
  const net = order.pointTransactions.reduce((s, t) => s + t.points, 0);
  if (net === 0) return;
  await tx.pointTransaction.create({
    data: {
      shopId: order.shopId,
      customerId: order.customerId,
      orderId: order.id,
      type: "adjust",
      points: -net,
      reason: `${reasonLabel} ${order.orderNo}`,
    },
  });
  await tx.customer.update({
    where: { id: order.customerId },
    data: { pointsBalance: { increment: -net } },
  });
}

/** クーポンの利用回数を1つ戻す（注文作成時に加算した分）。 */
async function releaseCouponUsage(tx: Tx, order: OrderForReversal): Promise<void> {
  if (!order.couponId) return;
  await tx.coupon.updateMany({
    where: { id: order.couponId, usedCount: { gt: 0 } },
    data: { usedCount: { decrement: 1 } },
  });
}

/**
 * 決済成立時の注文確定処理（Stripe webhook、または全額ポイント払いの即時確定から呼ぶ）。
 * 在庫・利用ポイント・クーポン回数はチェックアウト時（createCheckout）に既に
 * 引き当て済みなので、ここでは触らない。やることは:
 *   1. 原子的な確定権の取得（pending のときだけ paid 化）→ 二重実行防止
 *   2. 未紐付けなら既存顧客の解決 or 新規作成（会員番号 > メール > 電話 で突合）
 *      （会員確認済みの注文は作成時点で customerId が入っている）
 *   3. ポイント付与（PointTransaction + Customer.pointsBalance 更新）
 *
 * 冪等: 同じイベントが複数回届いても、確定権を取れた1回だけが副作用を実行する。
 */
export async function finalizeOrderPaid(
  orderId: number,
  stripePaymentId: string | null,
  stripeSessionId: string | null,
): Promise<void> {
  await db.$transaction(async (tx) => {
    // pending の行だけを paid に更新できる。並行/再送 webhook では2回目以降 count=0。
    // session id も突合し、metadata の orderId が指す注文がこのセッションの注文で
    // あることを担保する（取り違え防止の多層防御）。
    const claim = await tx.order.updateMany({
      where: {
        id: orderId,
        paymentStatus: "pending",
        deletedAt: null,
        ...(stripeSessionId ? { stripeSessionId } : {}),
      },
      data: {
        paymentStatus: "paid",
        status: "received",
        paidAt: new Date(),
        stripePaymentId,
      },
    });
    if (claim.count === 0) return; // 既に確定済み / 取消済み / セッション不一致

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
 * 予約の解放（決済失効・失敗・セッション作成失敗時）。
 * pending の注文だけを cancelled にし、引き当て済みの在庫・利用ポイント・クーポン回数を
 * 戻してソフトデリートする。
 * 冪等: pending を取れた1回だけ実行。paid/cancelled には何もしない。
 */
export async function releaseOrderReservation(
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
      include: reversalInclude,
    });
    if (!order) return;

    await restockOrderItems(tx, order, "予約解放");
    await reverseOrderPoints(tx, order, "予約解放");
    await releaseCouponUsage(tx, order);
  });
}

/**
 * 管理画面からの注文キャンセル（トランザクション内で確定権を取った後に呼ぶ副作用部分）。
 * 在庫を戻し、この注文のポイント（付与・利用）を正味で打ち消し、クーポン回数を戻す。
 */
export async function reverseOrderEffects(
  tx: Tx,
  orderId: number,
  reasonLabel: string,
): Promise<void> {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    include: reversalInclude,
  });
  if (!order) return;
  await restockOrderItems(tx, order, reasonLabel);
  await reverseOrderPoints(tx, order, reasonLabel);
  await releaseCouponUsage(tx, order);
}

/**
 * Stripe 側で返金された決済（charge.refunded）を社内データに反映する。
 * 対象の PaymentIntent を持つ paid 注文を refunded にし、在庫を戻し、ポイントの
 * 付与・利用を打ち消し、クーポン回数を戻す。冪等: paid の行を1回だけ確定する。
 */
export async function refundOrderByPaymentIntent(
  paymentIntentId: string,
): Promise<void> {
  if (!paymentIntentId) return;
  await db.$transaction(async (tx) => {
    const target = await tx.order.findFirst({
      where: { stripePaymentId: paymentIntentId, paymentStatus: "paid" },
      select: { id: true },
    });
    if (!target) return;

    const claim = await tx.order.updateMany({
      where: { id: target.id, paymentStatus: "paid" },
      data: { paymentStatus: "refunded", status: "cancelled" },
    });
    if (claim.count === 0) return;

    await reverseOrderEffects(tx, target.id, "返金");
  });
}
