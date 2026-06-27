import { db } from "@/helper/lib/db";

/** 注文完了ページ用。slug と orderNo が一致する注文の要約のみ返す。 */
export async function getOrderForComplete(slug: string, orderNo: string) {
  const shop = await db.shop.findFirst({
    where: { storeSlug: slug, storeActive: true, deletedAt: null },
    select: { id: true, name: true, storeTitle: true },
  });
  if (!shop) return null;

  const order = await db.order.findFirst({
    where: { orderNo, shopId: shop.id, deletedAt: null },
    select: {
      orderNo: true,
      buyerName: true,
      fulfillment: true,
      paymentStatus: true,
      subtotal: true,
      taxTotal: true,
      shippingFee: true,
      pointsEarned: true,
      total: true,
      items: { select: { name: true, qty: true, unitPrice: true, taxRate: true } },
    },
  });
  if (!order) return null;
  return { shop, order };
}
