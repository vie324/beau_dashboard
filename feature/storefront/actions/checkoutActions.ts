"use server";

import crypto from "node:crypto";
import { db } from "@/helper/lib/db";
import { getStripe, isStripeConfigured, appBaseUrl } from "@/helper/lib/stripe";
import {
  computeTotals,
  taxInclusiveUnit,
  type CartLine,
} from "@/helper/utils/retail";
import { toLocalDateString } from "@/helper/utils/time";
import {
  checkoutSchema,
  type CheckoutInput,
} from "@/feature/storefront/schema/checkoutSchema";

export type CheckoutResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

function genOrderNo(): string {
  const ymd = toLocalDateString().replace(/-/g, "");
  const rand = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `EC-${ymd}-${rand}`;
}

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
  if (!isStripeConfigured()) {
    return {
      ok: false,
      error:
        "決済が未設定です。店舗にお問い合わせください（STRIPE_SECRET_KEY 未設定）。",
    };
  }
  const data = parsed.data;

  // 店舗（公開中）を解決
  const shop = await db.shop.findFirst({
    where: { storeSlug: data.slug, storeActive: true, deletedAt: null },
    select: { id: true, shippingFee: true, pointRatePercent: true },
  });
  if (!shop) return { ok: false, error: "この販売ページはご利用いただけません" };

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

  const shippingFee = data.fulfillment === "shipping" ? shop.shippingFee : 0;
  if (data.fulfillment === "shipping" && !data.shippingAddress) {
    return { ok: false, error: "配送先住所を入力してください" };
  }
  const totals = computeTotals(lines, shippingFee, shop.pointRatePercent);

  const orderNo = genOrderNo();

  // 注文（pending）を作成
  let orderId: number;
  try {
    const order = await db.order.create({
      data: {
        shopId: shop.id,
        orderNo,
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
    orderId = order.id;
  } catch {
    return { ok: false, error: "注文の作成に失敗しました" };
  }

  // Stripe Checkout Session
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
    if (shippingFee > 0) {
      lineItems.push({
        quantity: 1,
        price_data: {
          currency: "jpy",
          unit_amount: shippingFee,
          product_data: { name: "送料" },
        },
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: lineItems,
      customer_email: data.buyerEmail ?? undefined,
      success_url: `${base}/shop/${data.slug}/complete?order=${orderNo}`,
      cancel_url: `${base}/shop/${data.slug}?canceled=1`,
      metadata: { orderId: String(orderId), orderNo },
    });

    await db.order.update({
      where: { id: orderId },
      data: { stripeSessionId: session.id },
    });

    if (!session.url) throw new Error("no url");
    return { ok: true, url: session.url };
  } catch {
    // セッション作成に失敗した注文は破棄（ソフトデリート）
    await db.order
      .update({
        where: { id: orderId },
        data: { deletedAt: new Date(), status: "cancelled" },
      })
      .catch(() => {});
    return {
      ok: false,
      error: "決済ページの作成に失敗しました。時間をおいて再度お試しください。",
    };
  }
}
