import { db } from "@/helper/lib/db";

export type ShopHours = {
  openTime: string | null;
  closeTime: string | null;
  breakStart: string | null;
  breakEnd: string | null;
};

export async function getShopHours(shopId: number): Promise<ShopHours> {
  const shop = await db.shop.findFirst({
    where: { id: shopId, deletedAt: null },
    select: {
      openTime: true,
      closeTime: true,
      breakStart: true,
      breakEnd: true,
    },
  });
  return {
    openTime: shop?.openTime ?? null,
    closeTime: shop?.closeTime ?? null,
    breakStart: shop?.breakStart ?? null,
    breakEnd: shop?.breakEnd ?? null,
  };
}
