import "server-only";
import { cookies } from "next/headers";
import { db } from "@/helper/lib/db";
import { getCurrentUser } from "@/helper/lib/auth";

export const ACTIVE_SHOP_COOKIE = "beau_active_shop_id";

/**
 * Resolves the brand the signed-in user belongs to.
 * Falls back to the first brand (single-tenant prototype convenience).
 */
export async function getActiveBrandId(): Promise<number> {
  const user = await getCurrentUser();
  if (user?.brandId) return user.brandId;

  const brand = await db.brand.findFirst({
    where: { deletedAt: null },
    orderBy: { id: "asc" },
  });
  return brand?.id ?? 1;
}

/**
 * Active shop resolution order:
 *   1. cookie `beau_active_shop_id` (if it points to a live shop in the brand)
 *   2. brand's shop with the smallest sortNumber
 *   3. fallback 1
 */
export async function getActiveShopId(): Promise<number> {
  const brandId = await getActiveBrandId();

  // shop / staff ロールは所属店舗(user.shopId)に固定する。cookie で同一ブランド内の
  // 別店舗へ越境できないようにする。店舗切替が許されるのは root / brand のみ。
  const user = await getCurrentUser();
  if (user && (user.role === "shop" || user.role === "staff") && user.shopId) {
    const own = await db.shop.findFirst({
      where: { id: user.shopId, brandId, deletedAt: null },
      select: { id: true },
    });
    if (own) return own.id;
  }

  const store = await cookies();
  const raw = store.get(ACTIVE_SHOP_COOKIE)?.value;

  if (raw) {
    const id = Number(raw);
    if (Number.isInteger(id)) {
      const shop = await db.shop.findFirst({
        where: { id, brandId, deletedAt: null },
        select: { id: true },
      });
      if (shop) return shop.id;
    }
  }

  const fallback = await db.shop.findFirst({
    where: { brandId, deletedAt: null },
    orderBy: [{ sortNumber: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  return fallback?.id ?? 1;
}

export async function listBrandShops(): Promise<
  { id: number; name: string }[]
> {
  const brandId = await getActiveBrandId();
  return db.shop.findMany({
    where: { brandId, deletedAt: null },
    orderBy: [{ sortNumber: "asc" }, { id: "asc" }],
    select: { id: true, name: true },
  });
}
