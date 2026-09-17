import { describe, expect, it } from "vitest";
import { shopSchema } from "@/feature/settings/schema/settingsSchema";

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
