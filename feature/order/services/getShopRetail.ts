import { db } from "@/helper/lib/db";

/** 物販ストアフロント設定（管理画面の設定カード用）。 */
export async function getShopRetail(shopId: number) {
  const shop = await db.shop.findFirst({
    where: { id: shopId, deletedAt: null },
    select: {
      id: true,
      name: true,
      storeActive: true,
      storeSlug: true,
      storeTitle: true,
      storeDescription: true,
      shippingFee: true,
      freeShippingThreshold: true,
      pointRatePercent: true,
      legalInfo: true,
      address: true,
      phone: true,
    },
  });
  return shop;
}

export type ShopRetail = NonNullable<Awaited<ReturnType<typeof getShopRetail>>>;
