// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  readBuyerInfo,
  writeBuyerInfo,
  clearBuyerInfo,
} from "@/feature/storefront/lib/buyerInfo";
import {
  readMemberSession,
  writeMemberSession,
  clearMemberSession,
} from "@/feature/storefront/lib/memberSession";
import { readCart, writeCart, cartCount, CART_CHANGE_EVENT } from "@/feature/storefront/lib/cart";

const SLUG = "beau-ginza";

beforeEach(() => window.localStorage.clear());

describe("buyerInfo", () => {
  it("空なら null、書けば読める", () => {
    expect(readBuyerInfo(SLUG)).toBeNull();
    writeBuyerInfo(SLUG, {
      buyerName: "山田",
      buyerPhone: "090",
      buyerEmail: "a@b.c",
      buyerCode: "1001",
      fulfillment: "shipping",
      shippingAddress: "東京",
    });
    expect(readBuyerInfo(SLUG)?.fulfillment).toBe("shipping");
    clearBuyerInfo(SLUG);
    expect(readBuyerInfo(SLUG)).toBeNull();
  });
  it("壊れた値は無視して既定に倒す", () => {
    window.localStorage.setItem(`beau_buyer_${SLUG}`, JSON.stringify({ fulfillment: "x", buyerName: 1 }));
    const v = readBuyerInfo(SLUG);
    expect(v?.fulfillment).toBe("pickup");
    expect(v?.buyerName).toBe("");
  });
});

describe("memberSession", () => {
  it("書き込み→読み出し→クリア、変更イベントが飛ぶ", () => {
    let fired = 0;
    window.addEventListener("beau:member-change", () => fired++);
    writeMemberSession(SLUG, { token: "t", name: "高橋", pointsBalance: 800 });
    expect(readMemberSession(SLUG)).toMatchObject({ token: "t", name: "高橋", pointsBalance: 800 });
    clearMemberSession(SLUG);
    expect(readMemberSession(SLUG)).toBeNull();
    expect(fired).toBe(2);
  });
  it("token の無い値は null", () => {
    window.localStorage.setItem(`beau_member_${SLUG}`, JSON.stringify({ name: "x" }));
    expect(readMemberSession(SLUG)).toBeNull();
  });
});

describe("cart change event", () => {
  it("writeCart で CART_CHANGE_EVENT が発火し、cartCount が合計数量を返す", () => {
    let fired = 0;
    window.addEventListener(CART_CHANGE_EVENT, () => fired++);
    writeCart(SLUG, [
      { productId: 1, qty: 2 },
      { productId: 2, qty: 3 },
    ]);
    expect(fired).toBe(1);
    expect(cartCount(SLUG)).toBe(5);
    expect(readCart(SLUG)).toHaveLength(2);
  });
});
