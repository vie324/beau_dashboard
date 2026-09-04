import { db } from "@/helper/lib/db";

/** 注文完了ページ用。slug と orderNo が一致する注文の要約のみ返す。 */
export async function getOrderForComplete(slug: string, orderNo: string) {
  const shop = await db.shop.findFirst({
    where: { storeSlug: slug, storeActive: true, deletedAt: null },
    select: { id: true, name: true, storeTitle: true, pointRatePercent: true },
  });
  if (!shop) return null;

  // 公開・無認証ページ（orderNo のみで参照）なので、購入者の個人情報
  // （氏名・連絡先・住所・ポイント残高）は返さない。注文番号・金額・受取方法・明細のみ。
  const order = await db.order.findFirst({
    where: { orderNo, shopId: shop.id, deletedAt: null },
    select: {
      orderNo: true,
      fulfillment: true,
      paymentStatus: true,
      status: true,
      subtotal: true,
      taxTotal: true,
      shippingFee: true,
      couponCode: true,
      discountAmount: true,
      pointsUsed: true,
      pointsEarned: true,
      total: true,
      customerId: true,
      items: { select: { name: true, qty: true, unitPrice: true, taxRate: true } },
    },
  });
  if (!order) return null;
  const { customerId, ...rest } = order;
  return { shop, order: { ...rest, isMember: customerId != null } };
}
