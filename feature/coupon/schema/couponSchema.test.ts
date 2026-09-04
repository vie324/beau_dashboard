import { describe, it, expect } from "vitest";
import { couponSchema } from "@/feature/coupon/schema/couponSchema";

const base = { code: "WELCOME10", name: "初回10%OFF", type: "percent", value: 10 };

describe("couponSchema", () => {
  it("最小構成で通り、既定値が入る", () => {
    const r = couponSchema.parse(base);
    expect(r.minSubtotal).toBe(0);
    expect(r.maxDiscount).toBe(0);
    expect(r.isActive).toBe(true);
    expect(r.showOnStore).toBe(false);
  });
  it("コードは半角英数字のみ", () => {
    expect(couponSchema.safeParse({ ...base, code: "ようこそ" }).success).toBe(false);
    expect(couponSchema.safeParse({ ...base, code: "WEL COME" }).success).toBe(false);
    expect(couponSchema.safeParse({ ...base, code: "wel-come_10" }).success).toBe(true);
  });
  it("％割引は100超で失敗、円引きは100超でも可", () => {
    expect(couponSchema.safeParse({ ...base, value: 101 }).success).toBe(false);
    expect(couponSchema.safeParse({ ...base, type: "fixed", value: 500 }).success).toBe(true);
  });
  it("終了日が開始日より前なら失敗", () => {
    expect(
      couponSchema.safeParse({ ...base, startsAt: "2026-10-01", expiresAt: "2026-09-01" }).success,
    ).toBe(false);
    expect(
      couponSchema.safeParse({ ...base, startsAt: "2026-09-01", expiresAt: "2026-09-30" }).success,
    ).toBe(true);
  });
  it('isActive "false" は false（boolean coercion 回帰防止）', () => {
    expect(couponSchema.parse({ ...base, isActive: "false" }).isActive).toBe(false);
    expect(couponSchema.parse({ ...base, showOnStore: "on" }).showOnStore).toBe(true);
  });
  it("値引き0は失敗", () => {
    expect(couponSchema.safeParse({ ...base, value: 0 }).success).toBe(false);
  });
});
