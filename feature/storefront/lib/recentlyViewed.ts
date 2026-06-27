"use client";

// 最近見た商品。localStorage に productId を新しい順で最大8件保持（slug 単位）。

const MAX = 8;

function key(slug: string): string {
  return `beau_recent_${slug}`;
}

export function readRecentlyViewed(slug: string): number[] {
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

export function pushRecentlyViewed(slug: string, productId: number): void {
  if (typeof window === "undefined") return;
  const list = readRecentlyViewed(slug).filter((id) => id !== productId);
  list.unshift(productId);
  try {
    window.localStorage.setItem(
      key(slug),
      JSON.stringify(list.slice(0, MAX)),
    );
  } catch {
    /* ignore quota */
  }
}
