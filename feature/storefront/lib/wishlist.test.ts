// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  readWishlist,
  toggleWishlist,
  isWished,
} from "@/feature/storefront/lib/wishlist";
import {
  readRecentlyViewed,
  pushRecentlyViewed,
} from "@/feature/storefront/lib/recentlyViewed";

const SLUG = "beau-ginza";

beforeEach(() => window.localStorage.clear());

describe("wishlist", () => {
  it("空のとき []", () => {
    expect(readWishlist(SLUG)).toEqual([]);
  });
  it("toggle で追加・削除", () => {
    toggleWishlist(SLUG, 3);
    expect(isWished(SLUG, 3)).toBe(true);
    toggleWishlist(SLUG, 3);
    expect(isWished(SLUG, 3)).toBe(false);
  });
  it("新しいものが先頭", () => {
    toggleWishlist(SLUG, 1);
    toggleWishlist(SLUG, 2);
    expect(readWishlist(SLUG)).toEqual([2, 1]);
  });
  it("非整数は無視して読む", () => {
    window.localStorage.setItem(`beau_wish_${SLUG}`, JSON.stringify([1, "x", 2]));
    expect(readWishlist(SLUG)).toEqual([1, 2]);
  });
});

describe("recentlyViewed", () => {
  it("先頭に追加、重複は前へ移動", () => {
    pushRecentlyViewed(SLUG, 1);
    pushRecentlyViewed(SLUG, 2);
    pushRecentlyViewed(SLUG, 1);
    expect(readRecentlyViewed(SLUG)).toEqual([1, 2]);
  });
  it("最大8件で打ち切り", () => {
    for (let i = 1; i <= 12; i++) pushRecentlyViewed(SLUG, i);
    const list = readRecentlyViewed(SLUG);
    expect(list).toHaveLength(8);
    expect(list[0]).toBe(12); // 最後に見たものが先頭
  });
});
