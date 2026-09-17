import { describe, it, expect } from "vitest";
import {
  parseWorkDates,
  serializeWorkDates,
  staffWorksOn,
  isLiveAppointment,
  pickVisibleStaffs,
} from "@/helper/utils/staffWork";

// 辻川(1)=常勤 / 久保(2)=臨時 9/15・9/28 / 米田(3)=臨時 9/7 のみ
const TSUJIKAWA = { id: 1, name: "辻川", spotMode: false, workDates: null };
const KUBO = {
  id: 2,
  name: "久保",
  spotMode: true,
  workDates: '["2026-09-15","2026-09-28"]',
};
const YONEDA = {
  id: 3,
  name: "米田",
  spotMode: true,
  workDates: '["2026-09-07"]',
};
const STAFFS = [TSUJIKAWA, KUBO, YONEDA];

const names = (
  rows: { name: string; offDuty: boolean }[],
): string[] => rows.map((s) => `${s.name}${s.offDuty ? "(勤務外)" : ""}`);

describe("parseWorkDates / serializeWorkDates", () => {
  it("JSON配列を重複なし・昇順で読む", () => {
    expect(parseWorkDates('["2026-09-28","2026-09-15","2026-09-15"]')).toEqual([
      "2026-09-15",
      "2026-09-28",
    ]);
  });
  it("空/不正な値は空配列", () => {
    expect(parseWorkDates(null)).toEqual([]);
    expect(parseWorkDates("")).toEqual([]);
    expect(parseWorkDates("なにか")).toEqual([]);
    expect(parseWorkDates('["2026/09/28"]')).toEqual([]);
  });
  it("往復しても同じ", () => {
    expect(parseWorkDates(serializeWorkDates(["2026-09-07"]))).toEqual([
      "2026-09-07",
    ]);
    expect(serializeWorkDates([])).toBeNull();
  });
});

describe("staffWorksOn", () => {
  it("常勤はどの日も出勤扱い", () => {
    expect(staffWorksOn(TSUJIKAWA, "2026-09-28")).toBe(true);
  });
  it("臨時は登録した出勤日だけ", () => {
    expect(staffWorksOn(YONEDA, "2026-09-07")).toBe(true);
    expect(staffWorksOn(YONEDA, "2026-09-28")).toBe(false);
    expect(staffWorksOn(KUBO, "2026-09-28")).toBe(true);
  });
});

describe("isLiveAppointment", () => {
  it("通常予約は対象", () => {
    expect(isLiveAppointment({ staffId: 3, kind: "appointment", status: 0 })).toBe(
      true,
    );
  });
  it("時間ブロックは対象外", () => {
    expect(isLiveAppointment({ staffId: 3, kind: "block", status: 0 })).toBe(
      false,
    );
  });
  it("キャンセル/当日キャンセル/無断キャンセルは対象外", () => {
    for (const status of [3, 4, 99]) {
      expect(
        isLiveAppointment({ staffId: 3, kind: "appointment", status }),
      ).toBe(false);
    }
  });
});

describe("pickVisibleStaffs", () => {
  it("出勤日の臨時スタッフだけを出す（9/28は久保のみ）", () => {
    expect(names(pickVisibleStaffs(STAFFS, "2026-09-28", []))).toEqual([
      "辻川",
      "久保",
    ]);
  });
  it("時間ブロックだけでは勤務外の列を復活させない", () => {
    const rows = [{ staffId: 3, kind: "block", status: 0 }];
    expect(names(pickVisibleStaffs(STAFFS, "2026-09-28", rows))).toEqual([
      "辻川",
      "久保",
    ]);
  });
  it("キャンセル済み予約だけでも列は出さない", () => {
    const rows = [{ staffId: 3, kind: "appointment", status: 3 }];
    expect(names(pickVisibleStaffs(STAFFS, "2026-09-28", rows))).toEqual([
      "辻川",
      "久保",
    ]);
  });
  it("生きている予約が残っている日は「勤務外」として列を出す", () => {
    const rows = [{ staffId: 3, kind: "appointment", status: 0 }];
    expect(names(pickVisibleStaffs(STAFFS, "2026-09-28", rows))).toEqual([
      "辻川",
      "久保",
      "米田(勤務外)",
    ]);
  });
  it("出勤日なら予約が無くても勤務外にはならない（9/7は米田）", () => {
    expect(names(pickVisibleStaffs(STAFFS, "2026-09-07", []))).toEqual([
      "辻川",
      "米田",
    ]);
  });
  it("指名なし(staffId=null)の予約は誰の列も復活させない", () => {
    const rows = [{ staffId: null, kind: "appointment", status: 0 }];
    expect(names(pickVisibleStaffs(STAFFS, "2026-09-28", rows))).toEqual([
      "辻川",
      "久保",
    ]);
  });
});
