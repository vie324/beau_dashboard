import { describe, expect, it } from "vitest";
import {
  addDaysYmd,
  addSlots,
  describeSchedule,
  emptySchedule,
  formatDuration,
  groupSlotsByDate,
  hasUpcomingDates,
  isLocalDateTime,
  isScheduleDate,
  isScheduleSlot,
  isUnrestricted,
  isYmd,
  openSlots,
  parseSchedule,
  publicScheduleNotices,
  publishStateAt,
  scheduleDatePage,
  serializeSchedule,
  type LinkSchedule,
} from "@/feature/booking-link/lib/schedule";

// 2026-10-05(月) 10:00 JST
const TODAY = "2026-10-05";
const NOW = Date.UTC(2026, 9, 5, 1, 0);
const OPTS = { today: TODAY, nowMs: NOW };

const schedule = (patch: Partial<LinkSchedule>): LinkSchedule => ({
  ...emptySchedule(),
  ...patch,
});

// ユーザーの例: 21日 14:15〜 / 16:15〜 の2枠限定フォーム
const TWO_SLOTS = schedule({
  mode: "slots",
  slots: [
    { date: "2026-10-21", time: "14:15" },
    { date: "2026-10-21", time: "16:15" },
  ],
  slotCapacity: 1,
});

describe("isYmd / isLocalDateTime", () => {
  it("実在する日付だけを受け付ける", () => {
    expect(isYmd("2026-10-21")).toBe(true);
    expect(isYmd("2026-02-30")).toBe(false);
    expect(isYmd("2026-1-5")).toBe(false);
    expect(isYmd(20261021)).toBe(false);
  });
  it("datetime-local の値（分まで）を受け付ける", () => {
    expect(isLocalDateTime("2026-10-20T23:59")).toBe(true);
    expect(isLocalDateTime("2026-10-20T24:00")).toBe(false);
    expect(isLocalDateTime("2026-10-20 23:59")).toBe(false);
    expect(isLocalDateTime("2026-02-30T10:00")).toBe(false);
  });
});

describe("parseSchedule", () => {
  it("未設定は制限なし", () => {
    for (const raw of [null, undefined, "", "  "]) {
      const s = parseSchedule(raw);
      expect(s).toEqual(emptySchedule());
      expect(isUnrestricted(s)).toBe(true);
    }
  });

  it("読めない設定は「何も予約できない」側に倒す（全日程に開かない）", () => {
    for (const raw of [
      "{壊れた",
      "[]",
      '"text"',
      '{"mode":"weekly"}',
      '{"mode":"range"}',
      '{"mode":"range","from":"2026-13-01"}',
    ]) {
      const s = parseSchedule(raw);
      expect(isUnrestricted(s)).toBe(false);
      expect(hasUpcomingDates(s, OPTS)).toBe(false);
    }
  });

  it("不正な項目は捨て、日付・枠は重複なしの昇順にそろえる", () => {
    const s = parseSchedule(
      JSON.stringify({
        mode: "slots",
        slots: [
          { date: "2026-10-21", time: "16:15" },
          { date: "2026-10-21", time: "14:15" },
          { date: "2026-10-21", time: "14:15" },
          { date: "2026-10-32", time: "10:00" },
          { date: "2026-10-22", time: "25:00" },
          "x",
        ],
        dows: [6, 6, 9, -1, 0],
        slotCapacity: -1,
        maxBookings: 1.5,
        leadMinutes: "60",
      }),
    );
    expect(s.slots).toEqual([
      { date: "2026-10-21", time: "14:15" },
      { date: "2026-10-21", time: "16:15" },
    ]);
    expect(s.dows).toEqual([0, 6]);
    expect(s.slotCapacity).toBeNull();
    expect(s.maxBookings).toBeNull();
    expect(s.leadMinutes).toBe(0);
  });

  it("7曜日すべての指定は「絞り込みなし」", () => {
    expect(
      parseSchedule('{"mode":"always","dows":[0,1,2,3,4,5,6]}').dows,
    ).toEqual([]);
  });
});

describe("serializeSchedule", () => {
  it("制限なしは null（列を空のままにする）", () => {
    expect(serializeSchedule(emptySchedule())).toBeNull();
  });

  it("モードに関係する項目だけを書く", () => {
    const json = serializeSchedule(
      schedule({
        mode: "dates",
        dates: ["2026-10-23", "2026-10-21", "2026-10-21"],
        dows: [6],
        slots: [{ date: "2026-10-21", time: "10:00" }],
        timeFrom: "13:00",
      }),
    );
    expect(JSON.parse(json!)).toEqual({
      mode: "dates",
      dates: ["2026-10-21", "2026-10-23"],
      timeFrom: "13:00",
    });
  });

  it("通常モードでも定員・受付期間があれば保存する", () => {
    expect(
      JSON.parse(
        serializeSchedule(
          schedule({ maxBookings: 10, closeAt: "2026-10-20T23:59" }),
        )!,
      ),
    ).toEqual({ mode: "always", maxBookings: 10, closeAt: "2026-10-20T23:59" });
  });

  it("保存 → 読み込みで同じ設定に戻る", () => {
    const s = schedule({
      mode: "range",
      from: "2026-10-01",
      to: "2026-10-31",
      dows: [0, 6],
      timeFrom: "10:00",
      timeTo: "12:00",
      slotCapacity: 2,
      maxBookings: 20,
      leadMinutes: 180,
      openAt: "2026-09-25T10:00",
      closeAt: "2026-10-30T18:00",
    });
    expect(parseSchedule(serializeSchedule(s))).toEqual(s);
    expect(parseSchedule(serializeSchedule(TWO_SLOTS))).toEqual(TWO_SLOTS);
  });
});

describe("isScheduleDate / isScheduleSlot", () => {
  it("期間限定は両端を含み、曜日でも絞り込める", () => {
    const s = schedule({ mode: "range", from: "2026-10-10", to: "2026-10-18", dows: [0, 6] });
    expect(isScheduleDate(s, "2026-10-09")).toBe(false);
    expect(isScheduleDate(s, "2026-10-10")).toBe(true); // 土
    expect(isScheduleDate(s, "2026-10-12")).toBe(false); // 月
    expect(isScheduleDate(s, "2026-10-18")).toBe(true); // 日
    expect(isScheduleDate(s, "2026-10-24")).toBe(false); // 土だが期間外
  });

  it("片側だけの期間（◯日から / ◯日まで）", () => {
    expect(isScheduleDate(schedule({ mode: "range", from: "2026-11-01" }), "2027-03-01")).toBe(true);
    expect(isScheduleDate(schedule({ mode: "range", from: "2026-11-01" }), "2026-10-31")).toBe(false);
    expect(isScheduleDate(schedule({ mode: "range", to: "2026-10-31" }), "2026-11-01")).toBe(false);
  });

  it("時間帯は両端を含む", () => {
    const s = schedule({ mode: "dates", dates: ["2026-10-21"], timeFrom: "10:00", timeTo: "12:00" });
    expect(isScheduleSlot(s, "2026-10-21", "09:30")).toBe(false);
    expect(isScheduleSlot(s, "2026-10-21", "10:00")).toBe(true);
    expect(isScheduleSlot(s, "2026-10-21", "12:00")).toBe(true);
    expect(isScheduleSlot(s, "2026-10-21", "12:15")).toBe(false);
    expect(isScheduleSlot(s, "2026-10-22", "10:00")).toBe(false);
  });

  it("枠限定は登録した日時そのものだけ", () => {
    expect(isScheduleSlot(TWO_SLOTS, "2026-10-21", "14:15")).toBe(true);
    expect(isScheduleSlot(TWO_SLOTS, "2026-10-21", "16:15")).toBe(true);
    expect(isScheduleSlot(TWO_SLOTS, "2026-10-21", "15:15")).toBe(false);
    expect(isScheduleSlot(TWO_SLOTS, "2026-10-22", "14:15")).toBe(false);
  });
});

describe("openSlots（締切前の枠）", () => {
  const today = schedule({
    mode: "slots",
    slots: [
      { date: TODAY, time: "09:00" },
      { date: TODAY, time: "11:00" },
      { date: TODAY, time: "14:00" },
    ],
  });
  it("開始時刻を過ぎた枠は出さない", () => {
    expect(openSlots(today, NOW).map((x) => x.time)).toEqual(["11:00", "14:00"]);
  });
  it("受付締切（◯時間前まで）を過ぎた枠も出さない", () => {
    expect(
      openSlots({ ...today, leadMinutes: 180 }, NOW).map((x) => x.time),
    ).toEqual(["14:00"]);
  });
});

describe("publishStateAt（受付期間）", () => {
  const s = schedule({ openAt: "2026-10-05T10:00", closeAt: "2026-10-05T18:00" });
  const at = (h: number, m: number, sec = 0) => Date.UTC(2026, 9, 5, h - 9, m, sec);
  it("開始前 / 受付中 / 終了後", () => {
    expect(publishStateAt(s, at(9, 59, 59))).toBe("before");
    expect(publishStateAt(s, at(10, 0))).toBe("open");
    expect(publishStateAt(s, at(18, 0, 59))).toBe("open"); // 18:00 の1分間は受付
    expect(publishStateAt(s, at(18, 1))).toBe("after");
  });
  it("未設定なら常に受付中", () => {
    expect(publishStateAt(emptySchedule(), NOW)).toBe("open");
  });
});

describe("scheduleDatePage（公開ページの日付送り）", () => {
  it("通常は今日から7日ずつ（従来の週表示と同じ）", () => {
    const p = scheduleDatePage(emptySchedule(), null, OPTS);
    expect(p.dates).toEqual(
      Array.from({ length: 7 }, (_, i) => addDaysYmd(TODAY, i)),
    );
    expect(p.prevCursor).toBeNull();
    expect(p.nextCursor).toBe("2026-10-12");

    const p2 = scheduleDatePage(emptySchedule(), p.nextCursor, OPTS);
    expect(p2.dates[0]).toBe("2026-10-12");
    expect(p2.prevCursor).toBe(TODAY);
  });

  it("過去・不正なカーソルは今日に丸める", () => {
    expect(scheduleDatePage(emptySchedule(), "2026-09-01", OPTS).dates[0]).toBe(TODAY);
    expect(scheduleDatePage(emptySchedule(), "abc", OPTS).dates[0]).toBe(TODAY);
  });

  it("曜日指定は該当する日だけを並べる", () => {
    const p = scheduleDatePage(schedule({ dows: [6] }), null, OPTS);
    expect(p.dates).toEqual([
      "2026-10-10",
      "2026-10-17",
      "2026-10-24",
      "2026-10-31",
      "2026-11-07",
      "2026-11-14",
      "2026-11-21",
    ]);
    expect(p.nextCursor).toBe("2026-11-28");
  });

  it("期間限定は期間内だけ。始まりが過去なら今日から", () => {
    const p = scheduleDatePage(
      schedule({ mode: "range", from: "2026-10-01", to: "2026-10-08" }),
      null,
      OPTS,
    );
    expect(p.dates).toEqual(["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08"]);
    expect(p.prevCursor).toBeNull();
    expect(p.nextCursor).toBeNull();
  });

  it("日付限定は過去の日を除き、7日ずつ送る", () => {
    const dates = [
      "2026-10-01",
      ...Array.from({ length: 9 }, (_, i) => addDaysYmd("2026-10-21", i * 7)),
    ];
    const p = scheduleDatePage(schedule({ mode: "dates", dates }), null, OPTS);
    expect(p.dates).toEqual(dates.slice(1, 8));
    expect(p.nextCursor).toBe(dates[8]);
    const p2 = scheduleDatePage(schedule({ mode: "dates", dates }), p.nextCursor, OPTS);
    expect(p2.dates).toEqual(dates.slice(8));
    // 前の画面 = 直前の7日分（10/21〜12/2）
    expect(p2.prevCursor).toBe(dates[1]);
  });

  it("枠限定は締切前の枠がある日だけ", () => {
    const s = schedule({
      mode: "slots",
      slots: [
        { date: TODAY, time: "09:00" }, // もう過ぎた
        ...TWO_SLOTS.slots,
      ],
    });
    expect(scheduleDatePage(s, null, OPTS).dates).toEqual(["2026-10-21"]);
  });

  it("遥か先のカーソルでも探索は上限日までで止まる", () => {
    const p = scheduleDatePage(schedule({ dows: [3] }), "9999-12-31", OPTS);
    expect(p.dates).toEqual([]);
    expect(p.prevCursor! <= addDaysYmd(TODAY, 730)).toBe(true);
  });

  it("期間限定の開始日が遠い先でも、受付日は残っている扱い", () => {
    const s = schedule({ mode: "range", from: "2029-04-01" });
    expect(hasUpcomingDates(s, OPTS)).toBe(true);
    expect(scheduleDatePage(s, null, OPTS).dates[0]).toBe("2029-04-01");
  });

  it("受付日がすべて過去なら「受付終了」", () => {
    expect(
      hasUpcomingDates(schedule({ mode: "dates", dates: ["2026-10-01"] }), OPTS),
    ).toBe(false);
    expect(
      hasUpcomingDates(schedule({ mode: "range", to: "2026-10-04" }), OPTS),
    ).toBe(false);
    expect(hasUpcomingDates(TWO_SLOTS, OPTS)).toBe(true);
  });
});

describe("枠の編集", () => {
  it("日付 × 時刻をまとめて追加し、重複は1つにする", () => {
    const slots = addSlots(
      [{ date: "2026-10-21", time: "14:15" }],
      ["2026-10-28", "2026-10-21"],
      ["16:15", "14:15"],
    );
    expect(groupSlotsByDate(slots)).toEqual([
      { date: "2026-10-21", times: ["14:15", "16:15"] },
      { date: "2026-10-28", times: ["14:15", "16:15"] },
    ]);
  });
});

describe("表示用の文言", () => {
  it("2枠限定フォームの要約", () => {
    expect(describeSchedule(TWO_SLOTS, TODAY)).toEqual([
      "10/21(水) 14:15・16:15（全2枠）",
      "各枠 1件まで",
    ]);
  });

  it("期間限定・曜日・時間帯・先着・締切・受付期間の要約", () => {
    expect(
      describeSchedule(
        schedule({
          mode: "range",
          from: "2026-10-01",
          to: "2027-01-05",
          dows: [1, 2, 3, 4, 5],
          timeFrom: "10:00",
          maxBookings: 10,
          leadMinutes: 1440,
          closeAt: "2026-12-28T18:00",
        }),
        TODAY,
      ),
    ).toEqual([
      "10/1(木)〜2027/1/5(火)",
      "毎週 平日",
      "10:00〜最終受付 開始",
      "先着 10件",
      "開始の24時間前まで受付",
      "受付期間 〜12/28(月) 18:00",
    ]);
  });

  it("お客様向けの案内", () => {
    expect(
      publicScheduleNotices(
        schedule({
          mode: "dates",
          dates: ["2026-10-01", "2026-10-21", "2026-10-23"],
          maxBookings: 5,
          closeAt: "2026-10-20T23:59",
        }),
        TODAY,
        { remaining: 3 },
      ),
    ).toEqual([
      "ご予約いただける日：10月21日(水)・10月23日(金)",
      "受付締切：10月20日(火) 23:59",
      "先着5名様限定（残り3名様）",
    ]);
  });

  it("時間の表記", () => {
    expect(formatDuration(30)).toBe("30分");
    expect(formatDuration(180)).toBe("3時間");
    expect(formatDuration(1440)).toBe("24時間");
    expect(formatDuration(10080)).toBe("7日");
  });
});
