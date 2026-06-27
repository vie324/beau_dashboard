// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  readCart,
  writeCart,
  addToCart,
  clearCart,
  type CartEntry,
} from "@/feature/storefront/lib/cart";

const SLUG = "beau-ginza";

beforeEach(() => {
  window.localStorage.clear();
});

describe("cart", () => {
  it("空のとき readCart は []", () => {
    expect(readCart(SLUG)).toEqual([]);
  });

  it("write→read で往復", () => {
    const entries: CartEntry[] = [{ productId: 1, qty: 2 }];
    writeCart(SLUG, entries);
    expect(readCart(SLUG)).toEqual(entries);
  });

  it("addToCart は新規追加", () => {
    addToCart(SLUG, 5, 3);
    expect(readCart(SLUG)).toEqual([{ productId: 5, qty: 3 }]);
  });

  it("addToCart は同一商品の数量を加算", () => {
    addToCart(SLUG, 5, 1);
    addToCart(SLUG, 5, 2);
    expect(readCart(SLUG)).toEqual([{ productId: 5, qty: 3 }]);
  });

  it("addToCart は数量を99で上限", () => {
    addToCart(SLUG, 5, 98);
    addToCart(SLUG, 5, 10);
    expect(readCart(SLUG)[0].qty).toBe(99);
  });

  it("不正な数量/IDのエントリは読み飛ばす", () => {
    window.localStorage.setItem(
      `beau_cart_${SLUG}`,
      JSON.stringify([
        { productId: 1, qty: 2 },
        { productId: 2, qty: 0 }, // qty<=0 除外
        { productId: "x", qty: 1 }, // 非整数ID除外
        null,
      ]),
    );
    expect(readCart(SLUG)).toEqual([{ productId: 1, qty: 2 }]);
  });

  it("壊れたJSONは空配列", () => {
    window.localStorage.setItem(`beau_cart_${SLUG}`, "{not json");
    expect(readCart(SLUG)).toEqual([]);
  });

  it("slug ごとに独立", () => {
    addToCart("shop-a", 1, 1);
    addToCart("shop-b", 2, 5);
    expect(readCart("shop-a")).toEqual([{ productId: 1, qty: 1 }]);
    expect(readCart("shop-b")).toEqual([{ productId: 2, qty: 5 }]);
  });

  it("clearCart で空になる", () => {
    addToCart(SLUG, 1, 1);
    clearCart(SLUG);
    expect(readCart(SLUG)).toEqual([]);
  });
});
