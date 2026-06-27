"use client";

// お気に入り（ウィッシュリスト）。localStorage に productId の配列を slug 単位で保持。
// 認証不要・サーバ非依存の toC 向けライト実装。

function key(slug: string): string {
  return `beau_wish_${slug}`;
}

export function readWishlist(slug: string): number[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key(slug));
    if (!raw) return [];
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v.filter((x) => Number.isInteger(x));
  } catch {
    return [];
  }
}

export function toggleWishlist(slug: string, productId: number): number[] {
  const list = readWishlist(slug);
  const idx = list.indexOf(productId);
  if (idx >= 0) list.splice(idx, 1);
  else list.unshift(productId);
  try {
    window.localStorage.setItem(key(slug), JSON.stringify(list));
  } catch {
    /* ignore quota */
  }
  return list;
}

export function isWished(slug: string, productId: number): boolean {
  return readWishlist(slug).includes(productId);
}
