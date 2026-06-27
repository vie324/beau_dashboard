import { describe, it, expect } from "vitest";
import { checkoutSchema } from "@/feature/storefront/schema/checkoutSchema";

const base = {
  slug: "beau-ginza",
  items: [{ productId: 1, qty: 2 }],
  buyerName: "山田 太郎",
  fulfillment: "pickup" as const,
};

describe("checkoutSchema", () => {
  it("最小構成で通る", () => {
    expect(checkoutSchema.safeParse(base).success).toBe(true);
  });
  it("カートが空なら失敗", () => {
    expect(checkoutSchema.safeParse({ ...base, items: [] }).success).toBe(false);
  });
  it("氏名が空なら失敗", () => {
    expect(checkoutSchema.safeParse({ ...base, buyerName: "" }).success).toBe(false);
  });
  it("不正なメールは失敗", () => {
    expect(
      checkoutSchema.safeParse({ ...base, buyerEmail: "not-an-email" }).success,
    ).toBe(false);
  });
  it("正しいメールは通る", () => {
    expect(
      checkoutSchema.safeParse({ ...base, buyerEmail: "taro@example.com" }).success,
    ).toBe(true);
  });
  it("fulfillment は pickup/shipping のみ", () => {
    expect(
      checkoutSchema.safeParse({ ...base, fulfillment: "teleport" }).success,
    ).toBe(false);
  });
  it("数量0以下は失敗", () => {
    expect(
      checkoutSchema.safeParse({ ...base, items: [{ productId: 1, qty: 0 }] }).success,
    ).toBe(false);
  });
  it("数量99超は失敗", () => {
    expect(
      checkoutSchema.safeParse({ ...base, items: [{ productId: 1, qty: 100 }] }).success,
    ).toBe(false);
  });
});
