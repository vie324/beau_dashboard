"use client";

// 公開ページのカートは localStorage に保存する（slug 単位）。
// 価格・在庫はサーバ側を正とするため、ここでは productId と数量のみ保持する。
// 変更時は CART_CHANGE_EVENT を発火し、ヘッダーのカート件数などが同期できるようにする。

export type CartEntry = { productId: number; qty: number };

export const CART_CHANGE_EVENT = "beau:cart-change";
/** ヘッダー等から「カートを開いて」と依頼するイベント。リスナーが preventDefault
 *  すれば処理済み（ドロワーを開いた）とみなし、未処理ならトップページへ遷移する。 */
export const OPEN_CART_EVENT = "beau:open-cart";

function key(slug: string): string {
  return `beau_cart_${slug}`;
}

function notify(): void {
  try {
    window.dispatchEvent(new Event(CART_CHANGE_EVENT));
  } catch {
    /* ignore */
  }
}

export function readCart(slug: string): CartEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key(slug));
    if (!raw) return [];
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v
      .filter(
        (e) =>
          e &&
          Number.isInteger(e.productId) &&
          Number.isInteger(e.qty) &&
          e.qty > 0,
      )
      .map((e) => ({ productId: e.productId, qty: e.qty }));
  } catch {
    return [];
  }
}

export function writeCart(slug: string, entries: CartEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key(slug), JSON.stringify(entries));
  } catch {
    /* ignore quota errors */
  }
  notify();
}

export function addToCart(slug: string, productId: number, qty = 1): void {
  const cart = readCart(slug);
  const found = cart.find((e) => e.productId === productId);
  if (found) found.qty = Math.min(99, found.qty + qty);
  else cart.push({ productId, qty: Math.min(99, qty) });
  writeCart(slug, cart);
}

export function clearCart(slug: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(key(slug));
  notify();
}

/** カート内の総数量。 */
export function cartCount(slug: string): number {
  return readCart(slug).reduce((s, e) => s + e.qty, 0);
}
