"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { db } from "@/helper/lib/db";
import { getCurrentUser } from "@/helper/lib/auth";
import { getActiveBrandId, ACTIVE_SHOP_COOKIE } from "@/helper/lib/shop-context";

/**
 * アクティブ店舗の切替。認可必須:
 *  - 未認証は拒否
 *  - 対象店舗が同一ブランドに属することを検証
 *  - shop / staff ロールは自店舗以外への切替を拒否（cookie 改ざんによる越境防止）
 */
export async function setActiveShopId(shopId: number): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  if (!Number.isInteger(shopId)) return;

  // shop / staff は自店舗のみ
  if ((user.role === "shop" || user.role === "staff") && user.shopId) {
    if (shopId !== user.shopId) return;
  }

  const brandId = await getActiveBrandId();
  const shop = await db.shop.findFirst({
    where: { id: shopId, brandId, deletedAt: null },
    select: { id: true },
  });
  if (!shop) return; // ブランド外の店舗には切替させない

  const store = await cookies();
  store.set(ACTIVE_SHOP_COOKIE, String(shopId), {
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");
}
