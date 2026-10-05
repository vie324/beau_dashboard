import { describe, expect, it } from "vitest";
import { linkScheduleSchema } from "@/feature/booking-link/schema/bookingLinkSchema";
import {
  emptySchedule,
  type LinkSchedule,
} from "@/feature/booking-link/lib/schedule";

const parse = (patch: Partial<LinkSchedule>) =>
  linkScheduleSchema.safeParse({ ...emptySchedule(), ...patch });

const firstError = (patch: Partial<LinkSchedule>) => {
  const r = parse(patch);
  return r.success ? null : r.error.issues[0]?.message;
};

describe("linkScheduleSchema", () => {
  it("制限なし・2枠限定はそのまま通る", () => {
    expect(parse({}).success).toBe(true);
    const r = parse({
      mode: "slots",
      slots: [
        { date: "2026-10-21", time: "14:15" },
        { date: "2026-10-21", time: "16:15" },
      ],
      slotCapacity: 1,
    });
    expect(r.success).toBe(true);
  });

  it("期間限定は開始日か終了日が必要で、終了日は開始日以降", () => {
    expect(firstError({ mode: "range" })).toBe(
      "期間の開始日か終了日を入力してください",
    );
    expect(firstError({ mode: "range", from: "2026-10-31", to: "2026-10-01" })).toBe(
      "期間の終了日は開始日以降にしてください",
    );
    expect(parse({ mode: "range", from: "2026-10-01" }).success).toBe(true);
    expect(parse({ mode: "range", from: "2026-10-01", to: "2026-10-01" }).success).toBe(true);
  });

  it("日付限定・枠限定は1つ以上必要", () => {
    expect(firstError({ mode: "dates" })).toBe(
      "予約を受け付ける日を1日以上選んでください",
    );
    expect(firstError({ mode: "slots" })).toBe(
      "受け付ける枠を1つ以上追加してください",
    );
  });

  it("時間帯・受付期間の前後関係", () => {
    expect(firstError({ timeFrom: "12:00", timeTo: "10:00" })).toBe(
      "時間帯の終わりは始まり以降にしてください",
    );
    expect(
      firstError({ openAt: "2026-10-20T10:00", closeAt: "2026-10-20T10:00" }),
    ).toBe("受付期間の終了は開始より後にしてください");
  });

  it("実在しない日付・時刻・不正な件数は弾く", () => {
    expect(parse({ mode: "dates", dates: ["2026-02-30"] }).success).toBe(false);
    expect(
      parse({ mode: "slots", slots: [{ date: "2026-10-21", time: "24:00" }] }).success,
    ).toBe(false);
    expect(firstError({ slotCapacity: 0 })).toBe(
      "1枠あたりの受付数は1以上で入力してください",
    );
    expect(firstError({ maxBookings: 2.5 })).toBe(
      "受付数の上限は整数で入力してください",
    );
  });

  it("オブジェクト以外は読み取れないエラー", () => {
    const r = linkScheduleSchema.safeParse(null);
    expect(r.success).toBe(false);
    expect(r.success ? "" : r.error.issues[0]?.message).toBe(
      "受付する日時の設定を読み取れませんでした",
    );
  });
});
