import { describe, it, expect } from "vitest";
import {
  taxInclusiveUnit,
  computeTotals,
  effectiveShipping,
  parseImageUrls,
  parseLegalInfo,
  formatYen,
  type CartLine,
} from "@/helper/utils/retail";

describe("taxInclusiveUnit", () => {
  it("10%税込を四捨五入で計算", () => {
    expect(taxInclusiveUnit(1000, 10)).toBe(1100);
    expect(taxInclusiveUnit(2980, 10)).toBe(3278);
  });
  it("8%軽減税率", () => {
    expect(taxInclusiveUnit(3600, 8)).toBe(3888);
  });
  it("0%非課税はそのまま", () => {
    expect(taxInclusiveUnit(1500, 0)).toBe(1500);
  });
  it("端数は四捨五入（round）", () => {
    // 105 * 1.08 = 113.4 -> 113
    expect(taxInclusiveUnit(105, 8)).toBe(113);
    // 95 * 1.08 = 102.6 -> 103
    expect(taxInclusiveUnit(95, 8)).toBe(103);
  });
});

describe("effectiveShipping", () => {
  it("店頭受取(base=0)は常に0", () => {
    expect(effectiveShipping(0, 99999, 5000)).toBe(0);
  });
  it("しきい値未満は送料あり", () => {
    expect(effectiveShipping(600, 4999, 5000)).toBe(600);
  });
  it("しきい値ちょうどで無料", () => {
    expect(effectiveShipping(600, 5000, 5000)).toBe(0);
  });
  it("しきい値超過で無料", () => {
    expect(effectiveShipping(600, 8000, 5000)).toBe(0);
  });
  it("しきい値0(無効)なら常に送料", () => {
    expect(effectiveShipping(600, 999999, 0)).toBe(600);
  });
});

describe("computeTotals", () => {
  const lines: CartLine[] = [
    { productId: 1, name: "A", price: 1000, taxRate: 10, qty: 2 }, // 税込1100 x2 = 2200
    { productId: 2, name: "B", price: 3600, taxRate: 8, qty: 1 }, // 税込3888 x1 = 3888
  ];

  it("税抜小計・税・税込合計が正しい", () => {
    const t = computeTotals(lines, 0, 0, 0);
    expect(t.subtotal).toBe(1000 * 2 + 3600); // 5600
    expect(t.itemsTotal).toBe(2200 + 3888); // 6088
    expect(t.taxTotal).toBe(6088 - 5600); // 488
    expect(t.shippingFee).toBe(0);
    expect(t.total).toBe(6088);
  });

  it("【不変条件】total = Σ(税込単価 x 数量) + 送料（Stripe line_items と一致）", () => {
    const base = 600;
    const t = computeTotals(lines, base, 0, 0);
    const stripeItemsTotal = lines.reduce(
      (s, l) => s + taxInclusiveUnit(l.price, l.taxRate) * l.qty,
      0,
    );
    expect(t.total).toBe(stripeItemsTotal + base);
    // subtotal + taxTotal は税込商品合計に一致しなければならない
    expect(t.subtotal + t.taxTotal).toBe(stripeItemsTotal);
  });

  it("送料無料しきい値を満たすと送料が落ちる", () => {
    // itemsTotal=6088 >= 5000 -> 送料無料
    const t = computeTotals(lines, 600, 0, 5000);
    expect(t.shippingFee).toBe(0);
    expect(t.total).toBe(6088);
  });

  it("ポイントは税抜小計の付与率%を切り捨て", () => {
    const t = computeTotals(lines, 0, 5, 0);
    // floor(5600 * 5 / 100) = 280
    expect(t.pointsEarned).toBe(280);
  });

  it("付与率0ならポイント0", () => {
    expect(computeTotals(lines, 0, 0, 0).pointsEarned).toBe(0);
  });

  it("空カートは全て0", () => {
    const t = computeTotals([], 600, 5, 5000);
    expect(t).toMatchObject({ subtotal: 0, taxTotal: 0, total: 0, pointsEarned: 0 });
  });
});

describe("parseImageUrls", () => {
  it("JSON配列をパース", () => {
    expect(parseImageUrls('["https://a.jpg","https://b.jpg"]')).toEqual([
      "https://a.jpg",
      "https://b.jpg",
    ]);
  });
  it("null/空は空配列", () => {
    expect(parseImageUrls(null)).toEqual([]);
    expect(parseImageUrls("")).toEqual([]);
  });
  it("非配列JSONは空配列", () => {
    expect(parseImageUrls('{"a":1}')).toEqual([]);
  });
  it("壊れたJSONは改行/カンマ区切りにフォールバック", () => {
    expect(parseImageUrls("https://a.jpg\nhttps://b.jpg")).toEqual([
      "https://a.jpg",
      "https://b.jpg",
    ]);
  });
  it("文字列以外の要素は除外", () => {
    expect(parseImageUrls('["https://a.jpg",123,null]')).toEqual([
      "https://a.jpg",
    ]);
  });
});

describe("parseLegalInfo", () => {
  it("オブジェクトをパース", () => {
    expect(parseLegalInfo('{"sellerName":"Beau"}')).toEqual({ sellerName: "Beau" });
  });
  it("null/壊れたJSONは空オブジェクト", () => {
    expect(parseLegalInfo(null)).toEqual({});
    expect(parseLegalInfo("not json")).toEqual({});
  });
});

describe("formatYen", () => {
  it("3桁区切りの円表記", () => {
    expect(formatYen(1234567)).toContain("1,234,567");
    expect(formatYen(0)).toContain("0");
  });
});
