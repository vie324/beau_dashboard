import { describe, expect, it } from "vitest";
import {
  formatStamp,
  wasUpdatedAfterCreate,
} from "@/helper/utils/bookingStamp";

describe("formatStamp", () => {
  it("JST の日付・曜日・時刻（分まで）で表示する", () => {
    expect(formatStamp(new Date("2026-09-28T05:32:59Z"))).toBe(
      "2026/09/28(月) 14:32",
    );
  });

  it("UTC では前日でも JST の日付になる", () => {
    expect(formatStamp(new Date("2026-09-27T15:05:00Z"))).toBe(
      "2026/09/28(月) 00:05",
    );
  });

  it("server action から文字列で届いた日時も扱える", () => {
    expect(formatStamp("2026-10-01T09:20:00.000Z")).toBe(
      "2026/10/01(木) 18:20",
    );
  });
});

describe("wasUpdatedAfterCreate", () => {
  const created = new Date("2026-09-28T05:32:00Z");

  it("作成と同時・1分未満の差は「更新なし」", () => {
    expect(wasUpdatedAfterCreate(created, created)).toBe(false);
    expect(
      wasUpdatedAfterCreate(created, new Date(created.getTime() + 59_999)),
    ).toBe(false);
  });

  it("1分以上あとに保存し直していれば「更新あり」", () => {
    expect(
      wasUpdatedAfterCreate(created, new Date(created.getTime() + 60_000)),
    ).toBe(true);
    expect(
      wasUpdatedAfterCreate(created.toISOString(), "2026-09-30T01:05:00Z"),
    ).toBe(true);
  });
});
