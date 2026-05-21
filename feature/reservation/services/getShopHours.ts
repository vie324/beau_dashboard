import { db } from "@/helper/lib/db";
import { resolveHoursForDate, type ResolvedHours } from "@/helper/utils/shopHours";

export type ShopHours = ResolvedHours;

/**
 * Resolve effective business hours for the given shop on a specific date,
 * applying day-of-week overrides on top of the shop defaults.
 */
export async function getShopHours(
  shopId: number,
  dateStr: string,
): Promise<ShopHours> {
  const shop = await db.shop.findFirst({
    where: { id: shopId, deletedAt: null },
    select: {
      openTime: true,
      closeTime: true,
      breakStart: true,
      breakEnd: true,
      hoursByDow: true,
    },
  });
  if (!shop) {
    return {
      isClosed: false,
      openTime: null,
      closeTime: null,
      breakStart: null,
      breakEnd: null,
    };
  }
  return resolveHoursForDate(shop, dateStr);
}
