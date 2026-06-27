import { describe, it, expect } from "vitest";
import {
  productSchema,
  storefrontSettingsSchema,
  legalInfoSchema,
  stockAdjustSchema,
} from "@/feature/product/schema/productSchema";

describe("productSchema.isPublic (boolean coercion 回帰防止)", () => {
  it('文字列 "false" は false になる（z.coerce.boolean のバグを踏まない）', () => {
    const r = productSchema.parse({ name: "X", price: 100, isPublic: "false" });
    expect(r.isPublic).toBe(false);
  });
  it('"true"/"on"/true は true', () => {
    expect(productSchema.parse({ name: "X", price: 1, isPublic: "true" }).isPublic).toBe(true);
    expect(productSchema.parse({ name: "X", price: 1, isPublic: "on" }).isPublic).toBe(true);
    expect(productSchema.parse({ name: "X", price: 1, isPublic: true }).isPublic).toBe(true);
  });
  it("未指定は既定で true", () => {
    expect(productSchema.parse({ name: "X", price: 1 }).isPublic).toBe(true);
  });
});

describe("productSchema.taxRate", () => {
  it("0/8/10 は許可", () => {
    for (const t of [0, 8, 10]) {
      expect(productSchema.parse({ name: "X", price: 1, taxRate: t }).taxRate).toBe(t);
    }
  });
  it("それ以外（20%等）は拒否", () => {
    expect(productSchema.safeParse({ name: "X", price: 1, taxRate: 20 }).success).toBe(false);
    expect(productSchema.safeParse({ name: "X", price: 1, taxRate: 5 }).success).toBe(false);
  });
});

describe("productSchema 必須・境界", () => {
  it("商品名が空なら失敗", () => {
    expect(productSchema.safeParse({ name: "", price: 100 }).success).toBe(false);
  });
  it("価格は文字列でも coerce される", () => {
    expect(productSchema.parse({ name: "X", price: "2980" }).price).toBe(2980);
  });
  it("負の価格は失敗", () => {
    expect(productSchema.safeParse({ name: "X", price: -1 }).success).toBe(false);
  });
});

describe("storefrontSettingsSchema.storeActive (boolean coercion 回帰防止)", () => {
  it('"false" は false', () => {
    expect(storefrontSettingsSchema.parse({ storeActive: "false" }).storeActive).toBe(false);
  });
  it('"on" は true', () => {
    expect(storefrontSettingsSchema.parse({ storeActive: "on" }).storeActive).toBe(true);
  });
  it("slug は英小文字/数字/ハイフンのみ", () => {
    expect(storefrontSettingsSchema.safeParse({ storeSlug: "Beau_Ginza" }).success).toBe(false);
    expect(storefrontSettingsSchema.safeParse({ storeSlug: "beau-ginza" }).success).toBe(true);
  });
  it("送料無料しきい値・付与率を数値化", () => {
    const r = storefrontSettingsSchema.parse({
      freeShippingThreshold: "5000",
      pointRatePercent: "5",
    });
    expect(r.freeShippingThreshold).toBe(5000);
    expect(r.pointRatePercent).toBe(5);
  });
  it("付与率は100超で失敗", () => {
    expect(storefrontSettingsSchema.safeParse({ pointRatePercent: 101 }).success).toBe(false);
  });
});

describe("stockAdjustSchema", () => {
  it("type は in/waste/adjust のみ", () => {
    expect(stockAdjustSchema.safeParse({ productId: 1, type: "out", amount: 1 }).success).toBe(false);
    expect(stockAdjustSchema.safeParse({ productId: 1, type: "in", amount: 5 }).success).toBe(true);
  });
  it("負の数量は失敗", () => {
    expect(stockAdjustSchema.safeParse({ productId: 1, type: "in", amount: -3 }).success).toBe(false);
  });
});

describe("legalInfoSchema", () => {
  it("全項目任意で空も通る", () => {
    expect(legalInfoSchema.safeParse({}).success).toBe(true);
  });
  it("長すぎる返品条件は失敗", () => {
    expect(legalInfoSchema.safeParse({ returnPolicy: "x".repeat(1001) }).success).toBe(false);
  });
});
