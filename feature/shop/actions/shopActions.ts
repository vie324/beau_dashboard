"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { ACTIVE_SHOP_COOKIE } from "@/helper/lib/shop-context";

export async function setActiveShopId(shopId: number): Promise<void> {
  const store = await cookies();
  store.set(ACTIVE_SHOP_COOKIE, String(shopId), {
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");
}
