import { describe, it, expect } from "vitest";
import {
  formatCampaignPeriod,
  formatMonthDay,
  isYmd,
  nextPointCampaign,
  parsePointCampaigns,
  pointCampaignLabel,
  pointCampaignStatus,
  resolvePointRate,
  serializePointCampaigns,
  MAX_POINT_CAMPAIGNS,
  type PointCampaign,
} from "@/helper/utils/pointCampaign";
import { computeTotals } from "@/helper/utils/retail";

/** JST の "YYYY-MM-DD HH:mm" を Date に（JST = UTC+9）。 */
const jst = (s: string) => new Date(`${s.replace(" ", "T")}:00+09:00`);

const autumn: PointCampaign = {
  label: "秋のポイントアップ",
  ratePercent: 10,
  startDate: "2026-11-01",
  endDate: "2026-11-30",
};

describe("isYmd", () => {
  it("実在する日付だけ true", () => {
    expect(isYmd("2026-11-30")).toBe(true);
    expect(isYmd("2028-02-29")).toBe(true);
    expect(isYmd("2026-02-29")).toBe(false);
    expect(isYmd("2026-13-01")).toBe(false);
    expect(isYmd("2026/11/30")).toBe(false);
    expect(isYmd("")).toBe(false);
    expect(isYmd(null)).toBe(false);
  });
});

describe("parsePointCampaigns", () => {
  it("null / 空 / 壊れた JSON は空配列", () => {
    expect(parsePointCampaigns(null)).toEqual([]);
    expect(parsePointCampaigns("")).toEqual([]);
    expect(parsePointCampaigns("{oops")).toEqual([]);
    expect(parsePointCampaigns('{"a":1}')).toEqual([]);
  });

  it("形式の合わない行は捨て、開始日順に並べる", () => {
    const raw = JSON.stringify([
      { label: "冬", ratePercent: 5, startDate: "2026-12-20", endDate: "2026-12-31" },
      { label: "壊れ", ratePercent: "10", startDate: "2026-11-01", endDate: "2026-11-30" },
      { label: "逆転", ratePercent: 10, startDate: "2026-11-30", endDate: "2026-11-01" },
      { label: "範囲外", ratePercent: 101, startDate: "2026-11-01", endDate: "2026-11-30" },
      { label: "小数", ratePercent: 2.5, startDate: "2026-11-01", endDate: "2026-11-30" },
      autumn,
    ]);
    expect(parsePointCampaigns(raw)).toEqual([
      autumn,
      { label: "冬", ratePercent: 5, startDate: "2026-12-20", endDate: "2026-12-31" },
    ]);
  });

  it("名前が無い行も読める（空文字）", () => {
    const raw = JSON.stringify([{ ratePercent: 8, startDate: "2026-11-01", endDate: "2026-11-01" }]);
    expect(parsePointCampaigns(raw)).toEqual([
      { label: "", ratePercent: 8, startDate: "2026-11-01", endDate: "2026-11-01" },
    ]);
  });

  it(`${MAX_POINT_CAMPAIGNS}件を超える分は読まない`, () => {
    const many = Array.from({ length: MAX_POINT_CAMPAIGNS + 5 }, (_, i) => ({
      label: "",
      ratePercent: 5,
      startDate: `2027-01-${String(i + 1).padStart(2, "0")}`,
      endDate: `2027-01-${String(i + 1).padStart(2, "0")}`,
    }));
    expect(parsePointCampaigns(JSON.stringify(many))).toHaveLength(MAX_POINT_CAMPAIGNS);
  });
});

describe("serializePointCampaigns", () => {
  it("空なら null（= 期間限定なし）", () => {
    expect(serializePointCampaigns([])).toBeNull();
  });
  it("読み戻すと同じ内容（開始日順・名前は trim）", () => {
    const winter = { label: " 冬 ", ratePercent: 5, startDate: "2026-12-20", endDate: "2026-12-31" };
    const json = serializePointCampaigns([winter, autumn]);
    expect(parsePointCampaigns(json)).toEqual([autumn, { ...winter, label: "冬" }]);
  });
});

describe("pointCampaignStatus", () => {
  it("開始日・終了日とも実施中に含む", () => {
    expect(pointCampaignStatus(autumn, "2026-10-31")).toBe("upcoming");
    expect(pointCampaignStatus(autumn, "2026-11-01")).toBe("active");
    expect(pointCampaignStatus(autumn, "2026-11-30")).toBe("active");
    expect(pointCampaignStatus(autumn, "2026-12-01")).toBe("ended");
  });
});

describe("resolvePointRate", () => {
  it("期間限定が無ければ通常の付与率", () => {
    expect(resolvePointRate(3, [], jst("2026-11-15 12:00"))).toEqual({
      ratePercent: 3,
      baseRatePercent: 3,
      campaign: null,
    });
  });

  it("期間中はその付与率、期間外は通常に戻る", () => {
    expect(resolvePointRate(3, [autumn], jst("2026-11-15 12:00")).ratePercent).toBe(10);
    expect(resolvePointRate(3, [autumn], jst("2026-12-01 00:00")).ratePercent).toBe(3);
    expect(resolvePointRate(3, [autumn], jst("2026-10-31 23:59")).ratePercent).toBe(3);
  });

  it("日付の境界は JST（終了日の 23:59 まで・開始日の 0:00 から）", () => {
    // 2026-11-30 23:59 JST = 2026-11-30 14:59 UTC
    expect(resolvePointRate(3, [autumn], jst("2026-11-30 23:59")).ratePercent).toBe(10);
    // 2026-11-01 00:00 JST = 2026-10-31 15:00 UTC（UTC ではまだ 10/31）
    expect(resolvePointRate(3, [autumn], jst("2026-11-01 00:00")).ratePercent).toBe(10);
  });

  it("通常より低い付与率にもできる（0% = 期間中は付与なし）", () => {
    const off = { label: "", ratePercent: 0, startDate: "2026-11-10", endDate: "2026-11-10" };
    const r = resolvePointRate(3, [off], jst("2026-11-10 12:00"));
    expect(r.ratePercent).toBe(0);
    expect(r.campaign).toEqual(off);
  });

  it("期間が重なったら付与率の高い方", () => {
    const weekend = { label: "週末", ratePercent: 15, startDate: "2026-11-21", endDate: "2026-11-23" };
    expect(resolvePointRate(3, [autumn, weekend], jst("2026-11-22 12:00")).campaign).toEqual(
      weekend,
    );
    expect(resolvePointRate(3, [weekend, autumn], jst("2026-11-24 12:00")).campaign).toEqual(
      autumn,
    );
  });

  it("付与ポイントの計算に使うと期間限定の率で付与される", () => {
    const lines = [{ productId: 1, name: "A", price: 5000, taxRate: 10, qty: 1 }];
    const during = resolvePointRate(3, [autumn], jst("2026-11-15 12:00")).ratePercent;
    const after = resolvePointRate(3, [autumn], jst("2026-12-15 12:00")).ratePercent;
    expect(computeTotals(lines, 0, during).pointsEarned).toBe(500);
    expect(computeTotals(lines, 0, after).pointsEarned).toBe(150);
  });
});

describe("nextPointCampaign", () => {
  it("これから始まる中で一番近いもの", () => {
    const winter = { label: "冬", ratePercent: 5, startDate: "2026-12-20", endDate: "2026-12-31" };
    expect(nextPointCampaign([winter, autumn], jst("2026-10-15 12:00"))).toEqual(autumn);
    expect(nextPointCampaign([winter, autumn], jst("2026-11-15 12:00"))).toEqual(winter);
    expect(nextPointCampaign([winter, autumn], jst("2027-01-01 12:00"))).toBeNull();
  });
});

describe("表示用", () => {
  it("formatMonthDay", () => {
    expect(formatMonthDay("2026-11-05")).toBe("11/5");
  });
  it("formatCampaignPeriod は今年なら年を省く", () => {
    const now = jst("2026-10-15 12:00");
    expect(formatCampaignPeriod(autumn, now)).toBe("11/1〜11/30");
    expect(
      formatCampaignPeriod({ startDate: "2026-11-03", endDate: "2026-11-03" }, now),
    ).toBe("11/3");
    expect(
      formatCampaignPeriod({ startDate: "2026-12-28", endDate: "2027-01-05" }, now),
    ).toBe("2026/12/28〜2027/1/5");
  });
  it("名前が空なら「期間限定」", () => {
    expect(pointCampaignLabel({ label: "  " })).toBe("期間限定");
    expect(pointCampaignLabel(autumn)).toBe("秋のポイントアップ");
  });
});
