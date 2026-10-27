import { describe, it, expect } from "vitest";
import {
  customHoursError,
  describeDateOverride,
  editDateOverrides,
  groupDateOverrides,
  parseDateOverrides,
  resolveHoursForDate,
  serializeDateOverrides,
} from "@/helper/utils/shopHours";

// 2026-12-29 は火曜、2026-12-27 は日曜。
const shop = {
  openTime: "09:00",
  closeTime: "20:00",
  breakStart: "12:30",
  breakEnd: "14:00",
  // 日曜定休
  hoursByDow: JSON.stringify({ "0": { closed: true } }),
  dateOverrides: null as string | null,
};

const yearEnd = {
  type: "custom" as const,
  openTime: "08:30",
  closeTime: "15:30",
  note: "年末特別診療",
};

describe("customHoursError", () => {
  it("開始・終了があれば OK（休憩は任意）", () => {
    expect(customHoursError({ openTime: "08:30", closeTime: "15:30" })).toBeNull();
    expect(
      customHoursError({
        openTime: "08:30",
        closeTime: "15:30",
        breakStart: "",
        breakEnd: "",
      }),
    ).toBeNull();
    expect(
      customHoursError({
        openTime: "09:00",
        closeTime: "18:00",
        breakStart: "12:00",
        breakEnd: "13:00",
      }),
    ).toBeNull();
  });

  it("時刻の欠け・前後逆・休憩の片側だけ・営業時間外の休憩はエラー", () => {
    expect(customHoursError({ openTime: "08:30" })).not.toBeNull();
    expect(customHoursError({ openTime: "15:30", closeTime: "08:30" })).not.toBeNull();
    expect(customHoursError({ openTime: "08:30", closeTime: "08:30" })).not.toBeNull();
    expect(
      customHoursError({ openTime: "08:30", closeTime: "15:30", breakStart: "12:00" }),
    ).not.toBeNull();
    expect(
      customHoursError({
        openTime: "08:30",
        closeTime: "15:30",
        breakStart: "15:00",
        breakEnd: "16:00",
      }),
    ).not.toBeNull();
  });
});

describe("parse / serialize（特別営業）", () => {
  it("特別営業の時刻を保持して往復できる", () => {
    const raw = serializeDateOverrides({ "2026-12-29": yearEnd });
    expect(parseDateOverrides(raw)).toEqual({ "2026-12-29": yearEnd });
  });

  it("時刻が不正な特別営業は捨てる（他の日は残す）", () => {
    const raw = JSON.stringify({
      "2026-12-29": { type: "custom", openTime: "15:30", closeTime: "08:30" },
      "2026-12-30": { type: "custom" },
      "2026-12-31": { type: "closed" },
    });
    expect(parseDateOverrides(raw)).toEqual({ "2026-12-31": { type: "closed" } });
  });

  it("特別営業以外の種類には時刻を持たせない", () => {
    const raw = JSON.stringify({
      "2026-12-31": { type: "closed", openTime: "08:30", closeTime: "15:30" },
    });
    expect(parseDateOverrides(raw)).toEqual({ "2026-12-31": { type: "closed" } });
  });

  it("休憩は両方そろっているときだけ保存する", () => {
    const raw = serializeDateOverrides({
      "2026-12-29": { ...yearEnd, breakStart: "12:00", breakEnd: "13:00" },
    });
    expect(parseDateOverrides(raw)["2026-12-29"]).toMatchObject({
      breakStart: "12:00",
      breakEnd: "13:00",
    });
  });
});

describe("resolveHoursForDate（特別営業）", () => {
  it("その日だけ登録した営業時間になり、いつもの休憩は使わない", () => {
    const s = { ...shop, dateOverrides: serializeDateOverrides({ "2026-12-29": yearEnd }) };
    expect(resolveHoursForDate(s, "2026-12-29")).toEqual({
      isClosed: false,
      openTime: "08:30",
      closeTime: "15:30",
      breakStart: null,
      breakEnd: null,
      dateOverride: yearEnd,
    });
    // 前後の日は通常どおり
    expect(resolveHoursForDate(s, "2026-12-28")).toEqual({
      isClosed: false,
      openTime: "09:00",
      closeTime: "20:00",
      breakStart: "12:30",
      breakEnd: "14:00",
    });
  });

  it("定休日に入れるとその日だけ営業日になる", () => {
    const s = {
      ...shop,
      dateOverrides: serializeDateOverrides({ "2026-12-27": yearEnd }),
    };
    expect(resolveHoursForDate(shop, "2026-12-27").isClosed).toBe(true);
    expect(resolveHoursForDate(s, "2026-12-27")).toMatchObject({
      isClosed: false,
      openTime: "08:30",
      closeTime: "15:30",
    });
  });

  it("特別営業の休憩を入れたらその休憩になる", () => {
    const s = {
      ...shop,
      dateOverrides: serializeDateOverrides({
        "2026-12-29": { ...yearEnd, breakStart: "11:30", breakEnd: "12:00" },
      }),
    };
    expect(resolveHoursForDate(s, "2026-12-29")).toMatchObject({
      breakStart: "11:30",
      breakEnd: "12:00",
    });
  });

  it("既存の休診・午前休・午後休はこれまでどおり", () => {
    const s = {
      ...shop,
      dateOverrides: serializeDateOverrides({
        "2026-12-29": { type: "closed" },
        "2026-12-30": { type: "morning" },
        "2026-12-31": { type: "afternoon" },
      }),
    };
    expect(resolveHoursForDate(s, "2026-12-29").isClosed).toBe(true);
    expect(resolveHoursForDate(s, "2026-12-30")).toMatchObject({
      isClosed: false,
      openTime: "14:00",
      closeTime: "20:00",
    });
    expect(resolveHoursForDate(s, "2026-12-31")).toMatchObject({
      isClosed: false,
      openTime: "09:00",
      closeTime: "12:30",
    });
  });
});

describe("describeDateOverride", () => {
  it("一覧・予約表に出す文言", () => {
    expect(describeDateOverride(yearEnd)).toBe("特別営業 8:30〜15:30");
    expect(
      describeDateOverride({ ...yearEnd, breakStart: "12:00", breakEnd: "13:00" }),
    ).toBe("特別営業 8:30〜15:30（休憩 12:00〜13:00）");
    expect(describeDateOverride({ type: "closed" })).toBe("休診");
    expect(describeDateOverride({ type: "morning" })).toBe("午前休");
  });
});

describe("groupDateOverrides", () => {
  const ov = (o: Record<string, unknown>) => JSON.stringify(o);

  it("同じ日・同じ内容の店舗をまとめ、今日より前は出さない", () => {
    const shops = [
      { id: 1, dateOverrides: ov({ "2026-12-29": yearEnd, "2026-01-01": { type: "closed" } }) },
      { id: 2, dateOverrides: ov({ "2026-12-29": yearEnd, "2026-12-31": { type: "closed" } }) },
      { id: 3, dateOverrides: ov({ "2026-12-29": { type: "closed" } }) },
      { id: 4, dateOverrides: null },
    ];
    expect(groupDateOverrides(shops, "2026-10-27")).toEqual([
      { date: "2026-12-29", override: yearEnd, shopIds: [1, 2] },
      { date: "2026-12-29", override: { type: "closed" }, shopIds: [3] },
      { date: "2026-12-31", override: { type: "closed" }, shopIds: [2] },
    ]);
  });

  it("メモが違えば別の行", () => {
    const shops = [
      { id: 1, dateOverrides: ov({ "2026-12-29": yearEnd }) },
      { id: 2, dateOverrides: ov({ "2026-12-29": { ...yearEnd, note: "院長のみ" } }) },
    ];
    expect(groupDateOverrides(shops, "2026-10-27")).toHaveLength(2);
  });
});

describe("editDateOverrides", () => {
  const raw = JSON.stringify({ "2026-12-29": yearEnd, "2026-12-31": { type: "closed" } });

  it("登録・上書き", () => {
    const next = editDateOverrides(raw, {
      set: { date: "2026-12-29", override: { type: "closed" } },
    });
    expect(parseDateOverrides(next)).toEqual({
      "2026-12-29": { type: "closed" },
      "2026-12-31": { type: "closed" },
    });
    expect(
      parseDateOverrides(
        editDateOverrides(null, { set: { date: "2026-12-29", override: yearEnd } }),
      ),
    ).toEqual({ "2026-12-29": yearEnd });
  });

  it("日付の変更（元の日を消して新しい日に入れる）", () => {
    const next = editDateOverrides(raw, {
      remove: "2026-12-29",
      set: { date: "2026-12-28", override: yearEnd },
    });
    expect(parseDateOverrides(next)).toEqual({
      "2026-12-28": yearEnd,
      "2026-12-31": { type: "closed" },
    });
  });

  it("削除して空になったら null", () => {
    const one = JSON.stringify({ "2026-12-29": yearEnd });
    expect(editDateOverrides(one, { remove: "2026-12-29" })).toBeNull();
  });
});
