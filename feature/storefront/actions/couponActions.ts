"use server";

import { z } from "zod";
import { db } from "@/helper/lib/db";
import { findCouponForCheckout } from "@/feature/coupon/lib/findCoupon";
import { taxInclusiveUnit, describeCoupon } from "@/helper/utils/retail";
import { checkoutItemSchema } from "@/feature/storefront/schema/checkoutSchema";

const previewSchema = z.object({
  slug: z.string().trim().min(1),
  code: z.string().trim().min(1, "クーポンコードを入力してください").max(40),
  items: z.array(checkoutItemSchema).min(1, "カートが空です").max(50),
});

export type CouponPreviewResult =
  | { ok: true; code: string; name: string; description: string; discount: number }
  | { ok: false; error: string };

/**
 * チェックアウト画面でのクーポン適用プレビュー。
 * 値引き額はサーバ側の商品価格から税込商品合計を再計算して判定する（クライアントの金額は信用しない）。
 * 実際の確定は createCheckout が同じ判定（findCouponForCheckout）をやり直す。
 */
export async function previewCoupon(
  input: z.infer<typeof previewSchema>,
): Promise<CouponPreviewResult> {
  const parsed = previewSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "入力内容を確認してください",
    };
  }
  const { slug, code, items } = parsed.data;
  const shop = await db.shop.findFirst({
    where: { storeSlug: slug, storeActive: true, deletedAt: null },
    select: { id: true },
  });
  if (!shop) return { ok: false, error: "この販売ページはご利用いただけません" };

  const products = await db.product.findMany({
    where: {
      id: { in: items.map((i) => i.productId) },
      shopId: shop.id,
      isPublic: true,
      deletedAt: null,
    },
    select: { id: true, price: true, taxRate: true },
  });
  const byId = new Map(products.map((p) => [p.id, p]));
  let itemsTotal = 0;
  for (const it of items) {
    const p = byId.get(it.productId);
    if (!p) continue;
    itemsTotal += taxInclusiveUnit(p.price, p.taxRate) * it.qty;
  }
  if (itemsTotal <= 0) return { ok: false, error: "カートに商品がありません" };

  const found = await findCouponForCheckout(db, shop.id, code, itemsTotal);
  if (!found.ok) return { ok: false, error: found.error };
  return {
    ok: true,
    code: found.coupon.code,
    name: found.coupon.name,
    description: describeCoupon(found.coupon),
    discount: found.discount,
  };
}
