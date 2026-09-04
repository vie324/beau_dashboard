import { describe, it, expect } from "vitest";
import {
  taxInclusiveUnit,
  computeTotals,
  effectiveShipping,
  parseImageUrls,
  parseLegalInfo,
  formatYen,
  clampPointsUsage,
  couponDiscountAmount,
  evaluateCoupon,
  describeCoupon,
  normalizeCouponCode,
  discountPercent,
  normalizePhoneDigits,
  STRIPE_MIN_CHARGE_JPY,
  type CartLine,
  type CouponRule,
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

  it("空カートでは値引き・ポイントも 0（負の請求にならない）", () => {
    const t = computeTotals([], 600, 5, 5000, { couponDiscount: 500, pointsUsed: 300 });
    expect(t).toMatchObject({ couponDiscount: 0, pointsUsed: 0, payable: 0, total: 0 });
  });

  it("クーポン値引きは税込商品合計から引き、送料は値引き前の合計で判定", () => {
    // itemsTotal=6088, coupon 1000 → 5088 + 送料(6088>=5000 で無料)
    const t = computeTotals(lines, 600, 0, 5000, { couponDiscount: 1000 });
    expect(t.couponDiscount).toBe(1000);
    expect(t.shippingFee).toBe(0);
    expect(t.payable).toBe(5088);
    expect(t.total).toBe(5088);
  });

  it("クーポン値引きは税込商品合計を超えない", () => {
    const t = computeTotals(lines, 0, 0, 0, { couponDiscount: 99999 });
    expect(t.couponDiscount).toBe(6088);
    expect(t.total).toBe(0);
  });

  it("ポイント利用は payable から引かれ、payable を超えない", () => {
    const t = computeTotals(lines, 600, 0, 0, { pointsUsed: 1000 });
    // itemsTotal 6088 + 送料 600 = payable 6688 → total 5688
    expect(t.payable).toBe(6688);
    expect(t.pointsUsed).toBe(1000);
    expect(t.total).toBe(5688);
    const full = computeTotals(lines, 600, 0, 0, { pointsUsed: 999999 });
    expect(full.pointsUsed).toBe(6688);
    expect(full.total).toBe(0);
  });

  it("【不変条件】total = itemsTotal - クーポン + 送料 - ポイント", () => {
    const t = computeTotals(lines, 600, 5, 0, { couponDiscount: 500, pointsUsed: 300 });
    expect(t.total).toBe(t.itemsTotal - t.couponDiscount + t.shippingFee - t.pointsUsed);
  });

  it("ポイント付与は値引き後の税抜相当額に対して計算（ポイント払い分には付かない）", () => {
    // subtotal 5600 - coupon 600 - points 1000 = 4000 → 5% = 200
    const t = computeTotals(lines, 0, 5, 0, { couponDiscount: 600, pointsUsed: 1000 });
    expect(t.pointsEarned).toBe(200);
    // 全額ポイント払いなら付与 0（負にならない）
    const full = computeTotals(lines, 0, 5, 0, { pointsUsed: 99999 });
    expect(full.pointsEarned).toBe(0);
  });
});

describe("clampPointsUsage", () => {
  it("0以下・非数は 0", () => {
    expect(clampPointsUsage(0, 1000, 5000)).toBe(0);
    expect(clampPointsUsage(-5, 1000, 5000)).toBe(0);
    expect(clampPointsUsage(Number.NaN, 1000, 5000)).toBe(0);
  });
  it("残高と支払額を超えない・小数は切り捨て", () => {
    expect(clampPointsUsage(800, 500, 5000)).toBe(500);
    expect(clampPointsUsage(9000, 10000, 5000)).toBe(5000);
    expect(clampPointsUsage(123.9, 1000, 5000)).toBe(123);
  });
  it("全額ポイント払い（残り0円）は許可", () => {
    expect(clampPointsUsage(5000, 5000, 5000)).toBe(5000);
  });
  it(`残りが 1〜${STRIPE_MIN_CHARGE_JPY - 1} 円になる場合は残り ${STRIPE_MIN_CHARGE_JPY} 円に調整`, () => {
    // 5000 - 4970 = 30 → 4950 に減らす（残り 50）
    expect(clampPointsUsage(4970, 10000, 5000)).toBe(4950);
    // ちょうど 50 円残るならそのまま
    expect(clampPointsUsage(4950, 10000, 5000)).toBe(4950);
    // 支払額自体が 50 円未満で一部利用 → 0（全額でないと最小決済額を割る）
    expect(clampPointsUsage(10, 100, 30)).toBe(0);
    expect(clampPointsUsage(30, 100, 30)).toBe(30);
  });
});

describe("couponDiscountAmount / evaluateCoupon", () => {
  const base: CouponRule = {
    type: "percent",
    value: 10,
    maxDiscount: 0,
    isActive: true,
    minSubtotal: 0,
    usedCount: 0,
  };
  it("%割引は切り捨て、上限があれば上限で止まる", () => {
    expect(couponDiscountAmount({ type: "percent", value: 10 }, 6088)).toBe(608);
    expect(
      couponDiscountAmount({ type: "percent", value: 10, maxDiscount: 500 }, 6088),
    ).toBe(500);
    expect(couponDiscountAmount({ type: "percent", value: 150 }, 1000)).toBe(1000);
  });
  it("円引きは商品合計を超えない", () => {
    expect(couponDiscountAmount({ type: "fixed", value: 500 }, 6088)).toBe(500);
    expect(couponDiscountAmount({ type: "fixed", value: 9999 }, 6088)).toBe(6088);
  });
  it("値引き0・合計0 は 0", () => {
    expect(couponDiscountAmount({ type: "fixed", value: 0 }, 6088)).toBe(0);
    expect(couponDiscountAmount({ type: "percent", value: 10 }, 0)).toBe(0);
  });
  it("有効なクーポンは ok と値引き額", () => {
    expect(evaluateCoupon(base, 6088)).toEqual({ ok: true, discount: 608 });
  });
  it("無効・期間外・上限到達・最低金額未満は理由付きで拒否", () => {
    const now = new Date("2026-09-03T00:00:00Z");
    expect(evaluateCoupon({ ...base, isActive: false }, 6088, now).ok).toBe(false);
    expect(
      evaluateCoupon({ ...base, startsAt: "2026-10-01T00:00:00Z" }, 6088, now).ok,
    ).toBe(false);
    expect(
      evaluateCoupon({ ...base, expiresAt: "2026-08-31T00:00:00Z" }, 6088, now).ok,
    ).toBe(false);
    expect(
      evaluateCoupon({ ...base, expiresAt: "2026-09-30T00:00:00Z" }, 6088, now).ok,
    ).toBe(true);
    expect(
      evaluateCoupon({ ...base, usageLimit: 3, usedCount: 3 }, 6088, now).ok,
    ).toBe(false);
    expect(
      evaluateCoupon({ ...base, usageLimit: 3, usedCount: 2 }, 6088, now).ok,
    ).toBe(true);
    const min = evaluateCoupon({ ...base, minSubtotal: 10000 }, 6088, now);
    expect(min.ok).toBe(false);
    if (!min.ok) expect(min.reason).toContain("10,000");
  });
  it("describeCoupon / normalizeCouponCode", () => {
    expect(describeCoupon({ type: "percent", value: 10, maxDiscount: 2000 })).toContain("10%OFF");
    expect(describeCoupon({ type: "percent", value: 10, maxDiscount: 2000 })).toContain("2,000");
    expect(describeCoupon({ type: "fixed", value: 500 })).toContain("500");
    expect(normalizeCouponCode("  welcome10 ")).toBe("WELCOME10");
    expect(normalizeCouponCode("ｗｅｌｃｏｍｅ１０")).toBe("WELCOME10");
  });
});

describe("discountPercent", () => {
  it("通常価格が高いときだけ割引率", () => {
    expect(discountPercent(3200, 3800)).toBe(16);
    expect(discountPercent(3200, 3200)).toBe(0);
    expect(discountPercent(3200, 3000)).toBe(0);
    expect(discountPercent(3200, null)).toBe(0);
    expect(discountPercent(3200, 0)).toBe(0);
  });
});

describe("normalizePhoneDigits", () => {
  it("ハイフン・空白・全角を吸収して数字だけにする", () => {
    expect(normalizePhoneDigits("090-1111-2222")).toBe("09011112222");
    expect(normalizePhoneDigits("０９０ １１１１ ２２２２")).toBe("09011112222");
    expect(normalizePhoneDigits("(03) 1234-5678")).toBe("0312345678");
    expect(normalizePhoneDigits(null)).toBe("");
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
