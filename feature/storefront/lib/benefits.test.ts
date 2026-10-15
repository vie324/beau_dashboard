import { describe, it, expect } from "vitest";
import { storeBenefits } from "@/feature/storefront/lib/benefits";

describe("storeBenefits", () => {
  const base = { shippingFee: 780, freeShippingThreshold: 10000, pointRatePercent: 3, allowPointRedeem: true };

  it("送料・ポイント・店頭受取・ポイント払いを並べる", () => {
    expect(storeBenefits(base).map((b) => [b.kind, b.label])).toEqual([
      ["shipping", "￥10,000以上で送料無料"],
      ["points", "ポイント3%還元"],
      ["pickup", "店頭受取OK"],
      ["redeem", "ポイントでお支払いOK"],
    ]);
    expect(storeBenefits(base)[0].detail).toContain("通常￥780");
  });

  it("期間限定ポイントの実施中は通常のポイントの代わりに先頭に出す", () => {
    const b = storeBenefits({
      ...base,
      pointCampaign: { label: "秋のポイントアップ", ratePercent: 10, baseRatePercent: 3, endDate: "2026-11-30" },
    });
    expect(b[0]).toMatchObject({ kind: "campaign", label: "秋のポイントアップ 11/30まで ポイント10%還元" });
    expect(b.some((x) => x.kind === "points")).toBe(false);
  });

  it("送料無料・付与なし・ポイント払い不可", () => {
    const b = storeBenefits({ shippingFee: 0, pointRatePercent: 0, allowPointRedeem: false });
    expect(b.map((x) => x.label)).toEqual(["全国送料無料", "店頭受取OK"]);
  });

  it("送料の情報が無いページ（完了ページ等）では送料を出さない", () => {
    expect(storeBenefits({}).map((x) => x.kind)).toEqual(["pickup"]);
  });
});
