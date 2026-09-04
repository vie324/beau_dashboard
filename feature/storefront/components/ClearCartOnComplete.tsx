"use client";

import { useEffect } from "react";
import { clearCart } from "@/feature/storefront/lib/cart";

/** 注文完了ページで端末のカートを空にする（決済中断で戻った場合は残す設計）。 */
export function ClearCartOnComplete({ slug }: { slug: string }) {
  useEffect(() => {
    clearCart(slug);
  }, [slug]);
  return null;
}
