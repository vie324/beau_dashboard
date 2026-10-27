import { describe, expect, it } from "vitest";
import { shopSchema, specialDaySchema } from "@/feature/settings/schema/settingsSchema";

const base = { name: "Dreamland 銀座本店" };

describe("shopSchema の通知設定", () => {
  it("通知先が未入力でも通る（メール通知なし）", () => {
    const r = shopSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.notifyManualBooking).toBe(false);
    }
  });

  it("複数アドレスをカンマ区切りで受け付ける", () => {
    expect(
      shopSchema.safeParse({
        ...base,
        notifyEmail: "salon@example.com, owner@example.com",
      }).success,
    ).toBe(true);
  });

  it("形式が不正なアドレスは弾く", () => {
    expect(
      shopSchema.safeParse({ ...base, notifyEmail: "salon@example" }).success,
    ).toBe(false);
    expect(
      shopSchema.safeParse({
        ...base,
        notifyEmail: "salon@example.com, broken",
      }).success,
    ).toBe(false);
  });

  it("チェックボックスの 'on' を true として扱う", () => {
    const r = shopSchema.safeParse({ ...base, notifyManualBooking: "on" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.notifyManualBooking).toBe(true);
  });

  it("'false' 文字列は false として扱う", () => {
    const r = shopSchema.safeParse({ ...base, notifyManualBooking: "false" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.notifyManualBooking).toBe(false);
  });
});

describe("specialDaySchema（特別営業日）", () => {
  // 12月29日 全店舗 8:30〜15:30 の登録（フォームが送る形）
  const yearEnd = {
    date: "2026-12-29",
    type: "custom",
    openTime: "08:30",
    closeTime: "15:30",
    breakStart: "",
    breakEnd: "",
    note: "年末特別診療",
    shopIds: "[1,2,3]",
  };

  it("特別営業の時間と対象店舗を受け付ける", () => {
    const r = specialDaySchema.safeParse(yearEnd);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.shopIds).toEqual([1, 2, 3]);
      expect(r.data.prevDate).toBeUndefined();
    }
  });

  it("特別営業で時刻が無い・前後逆なら弾く", () => {
    expect(specialDaySchema.safeParse({ ...yearEnd, closeTime: "" }).success).toBe(false);
    expect(
      specialDaySchema.safeParse({ ...yearEnd, openTime: "15:30", closeTime: "08:30" })
        .success,
    ).toBe(false);
  });

  it("休診は時刻なしで通る", () => {
    expect(
      specialDaySchema.safeParse({ date: "2026-12-31", type: "closed", shopIds: "[1]" })
        .success,
    ).toBe(true);
  });

  it("日付・対象店舗が無いと弾く", () => {
    expect(specialDaySchema.safeParse({ ...yearEnd, date: "" }).success).toBe(false);
    expect(specialDaySchema.safeParse({ ...yearEnd, date: "2026-02-30" }).success).toBe(
      false,
    );
    expect(specialDaySchema.safeParse({ ...yearEnd, shopIds: "[]" }).success).toBe(false);
    expect(specialDaySchema.safeParse({ ...yearEnd, shopIds: "broken" }).success).toBe(
      false,
    );
  });

  it("編集のときは元の日付と元の対象店舗を受け取る", () => {
    const r = specialDaySchema.safeParse({
      ...yearEnd,
      prevDate: "2026-12-28",
      prevShopIds: "[1,2]",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.prevDate).toBe("2026-12-28");
      expect(r.data.prevShopIds).toEqual([1, 2]);
    }
  });
});
