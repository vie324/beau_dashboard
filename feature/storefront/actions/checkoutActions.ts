"use server";

import crypto from "node:crypto";
import { db } from "@/helper/lib/db";
import { getStripe, isStripeConfigured, appBaseUrl } from "@/helper/lib/stripe";
import {
  computeTotals,
  taxInclusiveUnit,
  clampPointsUsage,
  STRIPE_MIN_CHARGE_JPY,
  type CartLine,
} from "@/helper/utils/retail";
import { toLocalDateString } from "@/helper/utils/time";
import {
  finalizeOrderPaid,
  releaseOrderReservation,
} from "@/feature/order/lib/finalizeOrder";
import { findCouponForCheckout } from "@/feature/coupon/lib/findCoupon";
import { verifyMemberToken } from "@/feature/storefront/lib/memberToken";
import {
  checkoutSchema,
  type CheckoutInput,
} from "@/feature/storefront/schema/checkoutSchema";

export type CheckoutResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

const MEMBER_EXPIRED =
  "会員確認の有効期限が切れました。お手数ですが、もう一度会員確認をしてください";

function genOrderNo(): string {
  const ymd = toLocalDateString().replace(/-/g, "");
  const rand = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `EC-${ymd}-${rand}`;
}

/**
 * 注文作成 → 決済ページ（Stripe Checkout）への誘導。
 *
 *  - 価格・在庫・ポイント残高・クーポンはすべてサーバ側の値を正とする。
 *  - 在庫・利用ポイント・クーポン回数は注文作成と同じトランザクションで「予約」し、
 *    決済失効/失敗時は webhook が releaseOrderReservation で戻す。
 *  - クーポン・ポイントの値引きは Stripe 側では一回限りのクーポン（amount_off）として
 *    セッションに載せる（line_items の合計 - 値引き = 請求額）。
 *  - 値引きで請求額が 0 円になった場合は Stripe を経由せず、その場で決済済みとして確定する。
 */
export async function createCheckout(
  input: CheckoutInput,
): Promise<CheckoutResult> {
  const parsed = checkoutSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "入力内容を確認してください",
    };
  }
  const data = parsed.data;

  // 店舗（公開中）を解決
  const shop = await db.shop.findFirst({
    where: { storeSlug: data.slug, storeActive: true, deletedAt: null },
    select: {
      id: true,
      shippingFee: true,
      freeShippingThreshold: true,
      pointRatePercent: true,
      allowPointRedeem: true,
    },
  });
  if (!shop) return { ok: false, error: "この販売ページはご利用いただけません" };

  if (data.fulfillment === "shipping" && !data.shippingAddress) {
    return { ok: false, error: "配送先住所を入力してください" };
  }

  // 会員確認（トークン → 顧客）。ポイント利用と注文の顧客紐付けに使う。
  let member: { id: number; pointsBalance: number } | null = null;
  if (data.memberToken) {
    const claims = verifyMemberToken(data.memberToken);
    if (!claims || claims.shopId !== shop.id) return { ok: false, error: MEMBER_EXPIRED };
    const c = await db.customer.findFirst({
      where: { id: claims.customerId, shopId: shop.id, deletedAt: null },
      select: { id: true, pointsBalance: true },
    });
    if (!c) return { ok: false, error: MEMBER_EXPIRED };
    member = c;
  }
  const wantPoints = data.pointsToUse ?? 0;
  if (wantPoints > 0 && !member) {
    return { ok: false, error: "ポイントをご利用いただくには会員確認が必要です" };
  }
  if (wantPoints > 0 && !shop.allowPointRedeem) {
    return {
      ok: false,
      error: "この店舗ではオンラインでのポイント利用を受け付けていません",
    };
  }

  // 価格・在庫はサーバ側の値を正とする（クライアント送信値は信用しない）
  const productIds = data.items.map((i) => i.productId);
  const products = await db.product.findMany({
    where: {
      id: { in: productIds },
      shopId: shop.id,
      isPublic: true,
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
      price: true,
      taxRate: true,
      inventory: { select: { quantity: true } },
    },
  });
  const byId = new Map(products.map((p) => [p.id, p]));

  const lines: CartLine[] = [];
  for (const item of data.items) {
    const p = byId.get(item.productId);
    if (!p) return { ok: false, error: "販売終了した商品が含まれています" };
    const stock = p.inventory?.quantity ?? 0;
    if (stock < item.qty) {
      return { ok: false, error: `「${p.name}」の在庫が不足しています（残り${stock}）` };
    }
    lines.push({
      productId: p.id,
      name: p.name,
      price: p.price,
      taxRate: p.taxRate,
      qty: item.qty,
    });
  }

  // クーポン（コード → 値引き額）。判定はプレビューと同じ findCouponForCheckout。
  let coupon: { id: number; code: string; usageLimit: number | null } | null = null;
  let couponDiscount = 0;
  if (data.couponCode && data.couponCode.trim()) {
    const itemsTotalIncl = lines.reduce(
      (s, l) => s + taxInclusiveUnit(l.price, l.taxRate) * l.qty,
      0,
    );
    const found = await findCouponForCheckout(
      db,
      shop.id,
      data.couponCode,
      itemsTotalIncl,
    );
    if (!found.ok) return { ok: false, error: found.error };
    coupon = {
      id: found.coupon.id,
      code: found.coupon.code,
      usageLimit: found.coupon.usageLimit,
    };
    couponDiscount = found.discount;
  }

  const baseShipping = data.fulfillment === "shipping" ? shop.shippingFee : 0;
  const pre = computeTotals(
    lines,
    baseShipping,
    shop.pointRatePercent,
    shop.freeShippingThreshold,
    { couponDiscount },
  );
  const pointsUsed = member
    ? clampPointsUsage(wantPoints, member.pointsBalance, pre.payable)
    : 0;
  const totals = computeTotals(
    lines,
    baseShipping,
    shop.pointRatePercent,
    shop.freeShippingThreshold,
    { couponDiscount, pointsUsed },
  );

  if (totals.total > 0 && totals.total < STRIPE_MIN_CHARGE_JPY) {
    return {
      ok: false,
      error: `お支払い金額が少額のため決済できません（${STRIPE_MIN_CHARGE_JPY}円以上、または全額ポイントでのお支払いをご利用ください）`,
    };
  }
  if (totals.total > 0 && !isStripeConfigured()) {
    return {
      ok: false,
      error:
        "決済が未設定です。店舗にお問い合わせください（STRIPE_SECRET_KEY 未設定）。",
    };
  }

  const orderNo = genOrderNo();

  // 注文作成 + 在庫・ポイント・クーポン回数の引当（予約）を1トランザクションで実施。
  // ここで確保することで、決済前のカート滞留や同時購入による売り越し・二重利用を防ぐ。
  let orderId: number;
  try {
    orderId = await db.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          shopId: shop.id,
          orderNo,
          customerId: member?.id ?? null,
          buyerName: data.buyerName,
          buyerPhone: data.buyerPhone ?? null,
          buyerEmail: data.buyerEmail ?? null,
          buyerCode: data.buyerCode ?? null,
          fulfillment: data.fulfillment,
          shippingAddress: data.shippingAddress ?? null,
          note: data.note ?? null,
          paymentStatus: "pending",
          status: "received",
          subtotal: totals.subtotal,
          taxTotal: totals.taxTotal,
          shippingFee: totals.shippingFee,
          couponId: coupon?.id ?? null,
          couponCode: coupon?.code ?? null,
          discountAmount: totals.couponDiscount,
          pointsUsed: totals.pointsUsed,
          pointsEarned: totals.pointsEarned,
          total: totals.total,
          items: {
            create: lines.map((l) => ({
              productId: l.productId,
              name: l.name,
              unitPrice: l.price,
              taxRate: l.taxRate,
              qty: l.qty,
            })),
          },
        },
        select: { id: true },
      });

      // 在庫引当（アトミックな条件付き減算）。
      // updateMany({ where: { quantity: { gte } }, data: { decrement } }) は
      // 単一の SQL UPDATE なので read-modify-write の競合（売り越し）が起きない。
      for (const l of lines) {
        const reserved = await tx.inventoryItem.updateMany({
          where: {
            productId: l.productId,
            shopId: shop.id,
            quantity: { gte: l.qty },
          },
          data: { quantity: { decrement: l.qty } },
        });
        if (reserved.count === 0) {
          // 在庫不足（または在庫レコード無し）→ ロールバック
          throw new Error("STOCK_CONFLICT");
        }
        await tx.stockMovement.create({
          data: {
            shopId: shop.id,
            productId: l.productId,
            type: "out",
            qty: -l.qty,
            reason: `予約 ${orderNo}`,
            orderId: order.id,
          },
        });
      }

      // ポイント引当（残高の条件付き減算 → 二重利用防止）
      if (member && totals.pointsUsed > 0) {
        const claimed = await tx.customer.updateMany({
          where: {
            id: member.id,
            shopId: shop.id,
            pointsBalance: { gte: totals.pointsUsed },
          },
          data: { pointsBalance: { decrement: totals.pointsUsed } },
        });
        if (claimed.count === 0) throw new Error("POINTS_CONFLICT");
        await tx.pointTransaction.create({
          data: {
            shopId: shop.id,
            customerId: member.id,
            orderId: order.id,
            type: "redeem",
            points: -totals.pointsUsed,
            reason: `注文 ${orderNo}（ポイント利用）`,
          },
        });
      }

      // クーポン回数の引当（上限がある場合は条件付き加算）
      if (coupon) {
        const used = await tx.coupon.updateMany({
          where: {
            id: coupon.id,
            shopId: shop.id,
            deletedAt: null,
            isActive: true,
            ...(coupon.usageLimit != null
              ? { usedCount: { lt: coupon.usageLimit } }
              : {}),
          },
          data: { usedCount: { increment: 1 } },
        });
        if (used.count === 0) throw new Error("COUPON_CONFLICT");
      }
      return order.id;
    });
  } catch (e) {
    const code = e instanceof Error ? e.message : "";
    if (code === "STOCK_CONFLICT") {
      return {
        ok: false,
        error:
          "申し訳ございません。ご注文手続き中に在庫が不足しました。数量をご確認ください。",
      };
    }
    if (code === "POINTS_CONFLICT") {
      return {
        ok: false,
        error: "ポイント残高が不足しています。利用ポイントをご確認ください。",
      };
    }
    if (code === "COUPON_CONFLICT") {
      return { ok: false, error: "このクーポンは利用上限に達しました" };
    }
    return { ok: false, error: "注文の作成に失敗しました" };
  }

  // 全額をクーポン・ポイントで賄えた → Stripe を経由せずその場で決済済みにする
  if (totals.total === 0) {
    try {
      await finalizeOrderPaid(orderId, null, null);
    } catch {
      await releaseOrderReservation(orderId, "cancelled").catch(() => {});
      return { ok: false, error: "注文の確定に失敗しました。時間をおいて再度お試しください。" };
    }
    return { ok: true, url: `/shop/${data.slug}/complete?order=${orderNo}` };
  }

  // Stripe Checkout Session（DBトランザクション外で実行）
  try {
    const stripe = getStripe();
    const base = appBaseUrl();
    const lineItems = lines.map((l) => ({
      quantity: l.qty,
      price_data: {
        currency: "jpy",
        unit_amount: taxInclusiveUnit(l.price, l.taxRate),
        product_data: { name: l.name },
      },
    }));
    if (totals.shippingFee > 0) {
      lineItems.push({
        quantity: 1,
        price_data: {
          currency: "jpy",
          unit_amount: totals.shippingFee,
          product_data: { name: "送料" },
        },
      });
    }

    // クーポン・ポイントの値引きは一回限りの Stripe クーポン（amount_off）として載せる。
    // line_items の合計（税込商品 + 送料）から差し引かれ、請求額は totals.total と一致する。
    const discountTotal = totals.couponDiscount + totals.pointsUsed;
    let discounts: { coupon: string }[] | undefined;
    if (discountTotal > 0) {
      const label = [
        totals.couponDiscount > 0 ? `クーポン${coupon ? ` ${coupon.code}` : ""}` : null,
        totals.pointsUsed > 0 ? `ポイント${totals.pointsUsed}pt` : null,
      ]
        .filter(Boolean)
        .join("・")
        .slice(0, 40);
      const stripeCoupon = await stripe.coupons.create({
        amount_off: discountTotal,
        currency: "jpy",
        duration: "once",
        max_redemptions: 1,
        name: label,
      });
      discounts = [{ coupon: stripeCoupon.id }];
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: lineItems,
      ...(discounts ? { discounts } : {}),
      customer_email: data.buyerEmail ?? undefined,
      // 予約在庫を長く保持しないよう 31 分で失効（Stripe 最小は30分。
      // クロックスキューで弾かれないよう少し余裕を持たせる）。
      // 失効すると checkout.session.expired が届き、在庫・ポイント・クーポン回数を解放する。
      expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
      success_url: `${base}/shop/${data.slug}/complete?order=${orderNo}`,
      cancel_url: `${base}/shop/${data.slug}/checkout?canceled=1`,
      metadata: { orderId: String(orderId), orderNo },
    });

    await db.order.update({
      where: { id: orderId },
      data: { stripeSessionId: session.id },
    });

    if (!session.url) throw new Error("no url");
    return { ok: true, url: session.url };
  } catch {
    // セッション作成失敗 → 予約（在庫・ポイント・クーポン）を解放して注文を破棄
    await releaseOrderReservation(orderId, "cancelled").catch(() => {});
    return {
      ok: false,
      error: "決済ページの作成に失敗しました。時間をおいて再度お試しください。",
    };
  }
}

/**
 * Stripe の決済ページから「戻る」で離脱したときの後始末。
 * 未完了（open）の Checkout Session を Stripe 側で失効させてから、予約していた
 * 在庫・ポイント・クーポン回数を解放する。完了済みのセッションは expire が失敗するので、
 * 決済済みの注文を誤って解放することはない（webhook の expired イベントとも冪等）。
 * 失効させない場合は 31 分後の自動失効まで在庫が押さえられ、すぐの再注文で
 * 「在庫不足」になり得るため、戻ってきた時点で解放しておく。
 */
export async function abandonCheckout(input: {
  slug: string;
  orderNo: string;
}): Promise<void> {
  const slug = String(input?.slug ?? "").trim();
  const orderNo = String(input?.orderNo ?? "").trim();
  if (!slug || !/^EC-\d{8}-[0-9A-F]{6}$/.test(orderNo)) return;
  if (!isStripeConfigured()) return;
  const order = await db.order.findFirst({
    where: {
      orderNo,
      paymentStatus: "pending",
      deletedAt: null,
      shop: { storeSlug: slug, deletedAt: null },
    },
    select: { id: true, stripeSessionId: true },
  });
  if (!order?.stripeSessionId) return;
  try {
    await getStripe().checkout.sessions.expire(order.stripeSessionId);
  } catch {
    return; // 既に完了/失効済み → 何もしない
  }
  await releaseOrderReservation(order.id, "cancelled").catch(() => {});
}
