import { dayOfWeekFromYmd, jstDateTimeToDate } from "@/helper/utils/time";

/**
 * 予約リンクの「受付する日時」設定（日付限定・期間限定・枠限定・受付期間・定員）。
 *
 * BookingLink.schedule に JSON (TEXT) で保存する。null / 空 = 制限なし（従来どおり
 * 営業日ならいつでも予約できる）。管理画面のフォーム・公開予約ページ・サーバーの
 * 空き判定と予約登録のすべてから使うので、ここには純粋な関数だけを置く。
 *
 * 予約できる日（mode）:
 *   always … 通常。営業日ならいつでも（曜日・時間帯で絞り込み可）
 *   range  … 期間限定。from〜to の間だけ（片方だけでも可。曜日・時間帯で絞り込み可）
 *   dates  … 日付限定。選んだ日だけ。時間帯を指定すると、その時間帯を店舗の営業時間・
 *            休憩・休業日に関係なく受け付ける（定休日や営業時間外の特別営業に使う）。
 *            時間帯を指定しなければ営業時間どおり
 *   slots  … 枠限定。日付＋開始時刻をピンポイントで指定（例: 21日 14:15〜 / 16:15〜）。
 *            店舗の営業時間・休憩・休業日の設定は使わず、指定した枠をそのまま出す
 *            （スタッフ・設備の空きは通常どおり確認する）。
 *
 * どのモードでも使える制限:
 *   slotCapacity … 1枠（同じ開始時刻）あたり、このリンクで受け付ける件数の上限
 *   maxBookings  … このリンクで受け付ける総数の上限（先着◯名）
 *   leadMinutes  … 開始の何分前まで受け付けるか（受付締切）。0 = 直前まで
 *   openAt / closeAt … 受付期間。この間だけリンクから予約できる（JST "YYYY-MM-DDTHH:mm"）。
 *                      closeAt はその1分間を含む（"23:59" なら 23:59:59 まで受付）
 *
 * 件数は「このリンク経由の、キャンセルされていない予約」で数える。店舗を選べる
 * リンク（ブランド共通）は全店舗の合計で数える。
 *
 * 保存済みの設定が読めない（壊れた JSON・未知のモード）ときは「何も予約できない」
 * 側に倒す。限定フォームが誤って全日程に開いてしまうより、受付が止まる方が害が小さい。
 */

export type ScheduleMode = "always" | "range" | "dates" | "slots";

export const SCHEDULE_MODES: readonly ScheduleMode[] = [
  "always",
  "range",
  "dates",
  "slots",
];

export const SCHEDULE_MODE_LABEL: Record<ScheduleMode, string> = {
  always: "通常",
  range: "期間限定",
  dates: "日付限定",
  slots: "枠限定",
};

export type ScheduleSlot = { date: string; time: string };

export type LinkSchedule = {
  mode: ScheduleMode;
  /** range: 開始日・終了日（どちらか片方だけでも可） */
  from: string | null;
  to: string | null;
  /** dates: 予約を受け付ける日（昇順・重複なし） */
  dates: string[];
  /** always / range: 曜日の絞り込み（0=日 … 6=土）。空 = 毎日 */
  dows: number[];
  /**
   * always / range / dates: 受け付ける開始時刻の範囲（両端を含む）。null = 営業時間どおり。
   * dates ではこの範囲が営業時間より優先される（dateWindowRange）
   */
  timeFrom: string | null;
  timeTo: string | null;
  /** slots: 受け付ける枠（日付・開始時刻の昇順・重複なし） */
  slots: ScheduleSlot[];
  /** 1枠（同じ開始時刻）あたりの受付件数の上限。null = 制限なし */
  slotCapacity: number | null;
  /** このリンクの受付総数の上限（先着）。null = 制限なし */
  maxBookings: number | null;
  /** 開始の何分前まで受け付けるか。0 = 直前まで */
  leadMinutes: number;
  /** 受付期間（JST "YYYY-MM-DDTHH:mm"）。null = 制限なし */
  openAt: string | null;
  closeAt: string | null;
};

/** 日付限定で選べる日数・枠限定で登録できる枠数の上限。 */
export const MAX_SCHEDULE_DATES = 366;
export const MAX_SCHEDULE_SLOTS = 300;

/** 公開ページで1画面に並べる日数。 */
export const DATE_PAGE_SIZE = 7;

/** 終わりのない設定（通常・終了日のない期間限定）で先を探す日数。 */
export const DATE_HORIZON_DAYS = 730;

export const LEAD_TIME_OPTIONS: readonly number[] = [
  0, 30, 60, 120, 180, 360, 720, 1440, 2880, 4320, 10080,
];

/** 制限なしの設定（mode を指定するとそのモードの空の設定）。 */
export function emptySchedule(mode: ScheduleMode = "always"): LinkSchedule {
  return {
    mode,
    from: null,
    to: null,
    dates: [],
    dows: [],
    timeFrom: null,
    timeTo: null,
    slots: [],
    slotCapacity: null,
    maxBookings: null,
    leadMinutes: 0,
    openAt: null,
    closeAt: null,
  };
}

/* ---------------- 値の検証 ---------------- */

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const LOCAL_DT_RE = /^(\d{4}-\d{2}-\d{2})T(([01]\d|2[0-3]):[0-5]\d)$/;

/** 実在する日付の "YYYY-MM-DD" か（2026-02-30 などは false）。 */
export function isYmd(v: unknown): v is string {
  if (typeof v !== "string" || !YMD_RE.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return (
    t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d
  );
}

export function isHhmm(v: unknown): v is string {
  return typeof v === "string" && HHMM_RE.test(v);
}

/** `<input type="datetime-local">` の値（"YYYY-MM-DDTHH:mm"）か。 */
export function isLocalDateTime(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const m = LOCAL_DT_RE.exec(v);
  return m != null && isYmd(m[1]);
}

function positiveInt(v: unknown): number | null {
  return typeof v === "number" && Number.isInteger(v) && v > 0 ? v : null;
}

function uniqSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function normalizeDows(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  const dows = [
    ...new Set(
      v.filter(
        (x): x is number => Number.isInteger(x) && x >= 0 && x <= 6,
      ),
    ),
  ].sort((a, b) => a - b);
  // 7曜日すべて = 絞り込みなし
  return dows.length === 7 ? [] : dows;
}

export function slotKey(slot: ScheduleSlot): string {
  return `${slot.date} ${slot.time}`;
}

/** 正しい枠だけを残し、重複を除いて日時順に並べる。 */
export function normalizeSlots(v: unknown): ScheduleSlot[] {
  if (!Array.isArray(v)) return [];
  const byKey = new Map<string, ScheduleSlot>();
  for (const x of v) {
    if (!x || typeof x !== "object") continue;
    const { date, time } = x as Record<string, unknown>;
    if (!isYmd(date) || !isHhmm(time)) continue;
    byKey.set(`${date} ${time}`, { date, time });
  }
  return [...byKey.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, s]) => s);
}

/* ---------------- 読み書き ---------------- */

/**
 * 任意の値を LinkSchedule に整える。不正な項目は捨てる。
 * 解釈できない（オブジェクトでない・未知のモード・期間の無い期間限定）なら null。
 */
export function normalizeSchedule(v: unknown): LinkSchedule | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const mode = o.mode ?? "always";
  if (!SCHEDULE_MODES.includes(mode as ScheduleMode)) return null;
  const s: LinkSchedule = {
    mode: mode as ScheduleMode,
    from: isYmd(o.from) ? o.from : null,
    to: isYmd(o.to) ? o.to : null,
    dates: uniqSorted(Array.isArray(o.dates) ? o.dates.filter(isYmd) : []),
    dows: normalizeDows(o.dows),
    timeFrom: isHhmm(o.timeFrom) ? o.timeFrom : null,
    timeTo: isHhmm(o.timeTo) ? o.timeTo : null,
    slots: normalizeSlots(o.slots),
    slotCapacity: positiveInt(o.slotCapacity),
    maxBookings: positiveInt(o.maxBookings),
    leadMinutes:
      typeof o.leadMinutes === "number" &&
      Number.isInteger(o.leadMinutes) &&
      o.leadMinutes > 0
        ? o.leadMinutes
        : 0,
    openAt: isLocalDateTime(o.openAt) ? o.openAt : null,
    closeAt: isLocalDateTime(o.closeAt) ? o.closeAt : null,
  };
  // 期間が読めない期間限定を「制限なし」にしてしまうと全日程に開くので、読めない扱い。
  if (s.mode === "range" && !s.from && !s.to) return null;
  return s;
}

/** 読めない設定の代わりに使う「何も予約できない」設定。 */
function closedSchedule(): LinkSchedule {
  return emptySchedule("dates");
}

/** BookingLink.schedule（JSON TEXT）を読む。未設定は制限なし、壊れていれば受付なし。 */
export function parseSchedule(raw: string | null | undefined): LinkSchedule {
  if (raw == null || raw.trim() === "") return emptySchedule();
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return closedSchedule();
  }
  return normalizeSchedule(v) ?? closedSchedule();
}

/** 何も制限していない（従来どおりの）設定か。 */
export function isUnrestricted(s: LinkSchedule): boolean {
  return (
    s.mode === "always" &&
    normalizeDows(s.dows).length === 0 &&
    !s.timeFrom &&
    !s.timeTo &&
    s.slotCapacity == null &&
    s.maxBookings == null &&
    !(s.leadMinutes > 0) &&
    !s.openAt &&
    !s.closeAt
  );
}

/**
 * 保存用の JSON。モードに関係する項目だけを書き、制限なしなら null。
 * （入力の検証は schema/bookingLinkSchema の linkScheduleSchema で済ませておくこと）
 */
export function serializeSchedule(s: LinkSchedule): string | null {
  if (isUnrestricted(s)) return null;
  const out: Record<string, unknown> = { mode: s.mode };
  if (s.mode === "range") {
    if (isYmd(s.from)) out.from = s.from;
    if (isYmd(s.to)) out.to = s.to;
  }
  if (s.mode === "dates") out.dates = uniqSorted(s.dates.filter(isYmd));
  if (s.mode === "slots") out.slots = normalizeSlots(s.slots);
  if (s.mode === "always" || s.mode === "range") {
    const dows = normalizeDows(s.dows);
    if (dows.length) out.dows = dows;
  }
  if (s.mode !== "slots") {
    if (isHhmm(s.timeFrom)) out.timeFrom = s.timeFrom;
    if (isHhmm(s.timeTo)) out.timeTo = s.timeTo;
  }
  if (positiveInt(s.slotCapacity)) out.slotCapacity = s.slotCapacity;
  if (positiveInt(s.maxBookings)) out.maxBookings = s.maxBookings;
  if (positiveInt(s.leadMinutes)) out.leadMinutes = s.leadMinutes;
  if (isLocalDateTime(s.openAt)) out.openAt = s.openAt;
  if (isLocalDateTime(s.closeAt)) out.closeAt = s.closeAt;
  return JSON.stringify(out);
}

/* ---------------- 日付・時刻 ---------------- */

const pad2 = (n: number) => String(n).padStart(2, "0");

/** "YYYY-MM-DD" を n 日ずらす（タイムゾーンに依存しない日付計算）。 */
export function addDaysYmd(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`;
}

/**
 * 開始時刻 "HH:mm" に施術時間（分）を足した終了時刻。予約の終了は常に
 * 「開始 + メニューの施術時間」なので、画面の表示もこれで揃える。日をまたぐと "翌0:30"。
 */
export function endTimeOf(time: string, durationMin: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + Math.max(0, durationMin);
  const hhmm = `${pad2(Math.floor(total / 60) % 24)}:${pad2(total % 60)}`;
  return total >= 24 * 60 ? `翌${hhmm}` : hhmm;
}

/** 日付＋開始時刻（JST）の絶対時刻（ms）。 */
export function slotStartMs(date: string, time: string): number {
  return jstDateTimeToDate(date, time).getTime();
}

/** "YYYY-MM-DDTHH:mm"（JST）の絶対時刻（ms）。 */
export function localDateTimeMs(v: string): number {
  const [d, t] = v.split("T");
  return jstDateTimeToDate(d, t).getTime();
}

function matchesDow(s: LinkSchedule, date: string): boolean {
  return s.dows.length === 0 || s.dows.includes(dayOfWeekFromYmd(date));
}

/** その日に予約を受け付けるか（営業日かどうか・時刻・締切は見ない）。 */
export function isScheduleDate(s: LinkSchedule, date: string): boolean {
  switch (s.mode) {
    case "always":
      return matchesDow(s, date);
    case "range":
      return (
        (!s.from || date >= s.from) &&
        (!s.to || date <= s.to) &&
        matchesDow(s, date)
      );
    case "dates":
      return s.dates.includes(date);
    case "slots":
      return s.slots.some((x) => x.date === date);
  }
}

/** 開始時刻が時間帯の範囲内か（両端を含む）。枠限定は登録した枠そのものなので常に true。 */
export function withinTimeWindow(s: LinkSchedule, time: string): boolean {
  if (s.mode === "slots") return true;
  if (s.timeFrom && time < s.timeFrom) return false;
  if (s.timeTo && time > s.timeTo) return false;
  return true;
}

/**
 * 店舗の営業時間ではなく、リンクの設定で受付時間が決まるか。
 * 枠限定と、時間帯を指定した日付限定が当てはまる。どちらも「この日のこの時間に
 * 受け付ける」と指定した設定なので、店舗の営業時間・休憩・休業日と「最終受付の挙動」は
 * 使わない（定休日や営業時間外の特別営業でも受け付けられるように）。
 * スタッフ・設備の空きは、どの設定でも確認する。
 */
export function ignoresShopHours(s: LinkSchedule): boolean {
  return (
    s.mode === "slots" ||
    (s.mode === "dates" && (s.timeFrom != null || s.timeTo != null))
  );
}

/** "HH:mm" → 0時からの分。読めなければ null（空き表の時刻計算と同じ読み方）。 */
function minutesOf(t: string | null | undefined): number | null {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  if (!Number.isInteger(h) || !Number.isInteger(m)) return null;
  return h * 60 + m;
}

/**
 * 時間帯を指定した日付限定で、その日に受け付ける開始時刻の範囲（0時からの分・両端を含む）。
 * 空欄の側は、その日の営業時間で補う。休業日や、補うと範囲が無くなる日（例: 14:15〜 で
 * その日は正午まで）は、入れた時刻だけを受け付ける。限定の受付が思わぬ時間まで
 * 広がらないよう、狭い側に倒す。
 * 日付限定で時間帯を指定していなければ null（営業時間どおり）。
 */
export function dateWindowRange(
  s: LinkSchedule,
  day: { isClosed: boolean; openTime: string | null; closeTime: string | null },
): { from: number; to: number } | null {
  if (s.mode !== "dates") return null;
  const from = minutesOf(s.timeFrom);
  const to = minutesOf(s.timeTo);
  // 営業日で時刻が未設定なら、空き表と同じ既定（9:00〜21:00）。
  const open = day.isClosed ? null : (minutesOf(day.openTime) ?? 9 * 60);
  const close = day.isClosed ? null : (minutesOf(day.closeTime) ?? 21 * 60);
  if (from != null && to != null) return { from, to };
  if (from != null) {
    return { from, to: close != null && close >= from ? close : from };
  }
  if (to != null) {
    return { from: open != null && open <= to ? open : to, to };
  }
  return null;
}

/** その日時（開始）を受け付ける設定か。締切・営業時間・空きは見ない。 */
export function isScheduleSlot(
  s: LinkSchedule,
  date: string,
  time: string,
): boolean {
  if (!isScheduleDate(s, date)) return false;
  if (s.mode === "slots") {
    return s.slots.some((x) => x.date === date && x.time === time);
  }
  return withinTimeWindow(s, time);
}

/** 受付締切の前か（開始時刻が「今 + 締切」以降なら予約できる）。 */
export function isBeforeDeadline(
  s: LinkSchedule,
  startMs: number,
  nowMs: number,
): boolean {
  return startMs >= nowMs + s.leadMinutes * 60_000;
}

/** 枠限定で、まだ締切前の枠（日時順）。枠限定以外は空。 */
export function openSlots(s: LinkSchedule, nowMs: number): ScheduleSlot[] {
  if (s.mode !== "slots") return [];
  return s.slots.filter((x) =>
    isBeforeDeadline(s, slotStartMs(x.date, x.time), nowMs),
  );
}

export type PublishState = "before" | "open" | "after";

/** 受付期間に対して今がどこにいるか。 */
export function publishStateAt(s: LinkSchedule, nowMs: number): PublishState {
  if (s.openAt && nowMs < localDateTimeMs(s.openAt)) return "before";
  if (s.closeAt && nowMs >= localDateTimeMs(s.closeAt) + 60_000) return "after";
  return "open";
}

/* ---------------- 公開ページの日付送り ---------------- */

export type DateListOptions = {
  /** 今日（JST "YYYY-MM-DD"）。これより前の日は返さない */
  today: string;
  /** 現在時刻（ms）。枠限定で締切を過ぎた枠を除くのに使う */
  nowMs: number;
  horizonDays?: number;
};

/** 日付限定・枠限定の候補日（昇順）。それ以外のモードは null（無限に続く）。 */
function finiteDates(s: LinkSchedule, nowMs: number): string[] | null {
  if (s.mode === "dates") return uniqSorted(s.dates);
  if (s.mode === "slots") {
    return uniqSorted(openSlots(s, nowMs).map((x) => x.date));
  }
  return null;
}

/**
 * 探索の上限日。通常・終了日のない期間限定はここまでしか先を見ない
 * （期間限定は開始日から数える。遠い先の開始日でも「受付終了」にならないように）。
 */
function lastSearchDate(s: LinkSchedule, opts: DateListOptions): string {
  const base =
    s.mode === "range" && s.from && s.from > opts.today ? s.from : opts.today;
  const horizon = addDaysYmd(base, opts.horizonDays ?? DATE_HORIZON_DAYS);
  return s.mode === "range" && s.to && s.to < horizon ? s.to : horizon;
}

/** start 以降（今日以降）で予約を受け付ける日を、昇順で最大 limit 件。 */
export function scheduleDatesFrom(
  s: LinkSchedule,
  start: string,
  limit: number,
  opts: DateListOptions,
): string[] {
  const lower = start > opts.today ? start : opts.today;
  const finite = finiteDates(s, opts.nowMs);
  if (finite) return finite.filter((d) => d >= lower).slice(0, limit);

  const end = lastSearchDate(s, opts);
  let d = s.mode === "range" && s.from && s.from > lower ? s.from : lower;
  const out: string[] = [];
  while (d <= end && out.length < limit) {
    if (isScheduleDate(s, d)) out.push(d);
    d = addDaysYmd(d, 1);
  }
  return out;
}

/** before より前（今日以降）で予約を受け付ける日を、before に近い側から最大 limit 件（昇順）。 */
export function scheduleDatesBefore(
  s: LinkSchedule,
  before: string,
  limit: number,
  opts: DateListOptions,
): string[] {
  const finite = finiteDates(s, opts.nowMs);
  if (finite) {
    const hits = finite.filter((d) => d < before && d >= opts.today);
    return hits.slice(Math.max(0, hits.length - limit));
  }

  const floor =
    s.mode === "range" && s.from && s.from > opts.today ? s.from : opts.today;
  // 送られてきたカーソルが遥か先でも、探索は上限日から始める（無駄なループを避ける）。
  const end = lastSearchDate(s, opts);
  let d = addDaysYmd(before > end ? addDaysYmd(end, 1) : before, -1);
  const out: string[] = [];
  while (d >= floor && out.length < limit) {
    if (isScheduleDate(s, d)) out.unshift(d);
    d = addDaysYmd(d, -1);
  }
  return out;
}

/**
 * 公開ページの1画面分の日付と、前後の画面の先頭日。
 * cursor はその画面の先頭日（無い・不正・過去なら今日）。
 */
export function scheduleDatePage(
  s: LinkSchedule,
  cursor: string | null | undefined,
  opts: DateListOptions,
  pageSize = DATE_PAGE_SIZE,
): { dates: string[]; prevCursor: string | null; nextCursor: string | null } {
  const start = isYmd(cursor) && cursor > opts.today ? cursor : opts.today;
  const dates = scheduleDatesFrom(s, start, pageSize, opts);
  const prev = scheduleDatesBefore(s, dates[0] ?? start, pageSize, opts);
  const last = dates[dates.length - 1];
  const next = last ? scheduleDatesFrom(s, addDaysYmd(last, 1), 1, opts) : [];
  return {
    dates,
    prevCursor: prev[0] ?? null,
    nextCursor: next[0] ?? null,
  };
}

/** 今日以降に予約を受け付ける日が1日でも残っているか。 */
export function hasUpcomingDates(s: LinkSchedule, opts: DateListOptions): boolean {
  return scheduleDatesFrom(s, opts.today, 1, opts).length > 0;
}

/**
 * 受付の状態。open 受付中 / before 受付開始前 / after 受付期間の終了後 /
 * ended 受付する日がもう無い / full 先着の定員に達した。
 * bookedCount（このリンク経由の予約件数）を省くと定員は見ない。
 */
export type ScheduleState = "open" | "before" | "after" | "ended" | "full";

export function scheduleState(
  s: LinkSchedule,
  opts: DateListOptions & { bookedCount?: number | null },
): ScheduleState {
  const publish = publishStateAt(s, opts.nowMs);
  if (publish !== "open") return publish;
  if (!hasUpcomingDates(s, opts)) return "ended";
  if (
    s.maxBookings != null &&
    opts.bookedCount != null &&
    opts.bookedCount >= s.maxBookings
  ) {
    return "full";
  }
  return "open";
}

/* ---------------- 枠の編集 ---------------- */

/** 既存の枠に「日付 × 開始時刻」の組み合わせをまとめて足す。 */
export function addSlots(
  existing: ScheduleSlot[],
  dates: string[],
  times: string[],
): ScheduleSlot[] {
  return normalizeSlots([
    ...existing,
    ...dates.flatMap((date) => times.map((time) => ({ date, time }))),
  ]);
}

/** 枠を日付ごとにまとめる（日付・時刻の昇順）。 */
export function groupSlotsByDate(
  slots: ScheduleSlot[],
): { date: string; times: string[] }[] {
  const map = new Map<string, string[]>();
  for (const s of normalizeSlots(slots)) {
    const times = map.get(s.date);
    if (times) times.push(s.time);
    else map.set(s.date, [s.time]);
  }
  return [...map.entries()].map(([date, times]) => ({ date, times }));
}

/* ---------------- 表示用の文言 ---------------- */

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

/** 月曜始まりの曜日（設定画面の並びに合わせる）。 */
export const DOW_ORDER: readonly number[] = [1, 2, 3, 4, 5, 6, 0];

export function weekdayJa(ymd: string): string {
  return WEEKDAYS[dayOfWeekFromYmd(ymd)];
}

export function dowLabel(dow: number): string {
  return WEEKDAYS[dow] ?? "";
}

/** "10/21(水)"。today と年が違うときは "2027/1/5(火)"。 */
export function formatShortDate(ymd: string, today?: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const year = today && today.slice(0, 4) !== ymd.slice(0, 4) ? `${y}/` : "";
  return `${year}${m}/${d}(${weekdayJa(ymd)})`;
}

/** "10月21日(水)"。today と年が違うときは "2027年1月5日(火)"。 */
export function formatLongDate(ymd: string, today?: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const year = today && today.slice(0, 4) !== ymd.slice(0, 4) ? `${y}年` : "";
  return `${year}${m}月${d}日(${weekdayJa(ymd)})`;
}

/** "10/1(木) 10:00" */
export function formatShortDateTime(v: string, today?: string): string {
  const [d, t] = v.split("T");
  return `${formatShortDate(d, today)} ${t}`;
}

/** "10月1日(木) 10:00" */
export function formatLongDateTime(v: string, today?: string): string {
  const [d, t] = v.split("T");
  return `${formatLongDate(d, today)} ${t}`;
}

/** 分 → "30分" / "3時間" / "7日" */
export function formatDuration(min: number): string {
  if (min < 60) return `${min}分`;
  if (min % 60 === 0 && min <= 72 * 60) return `${min / 60}時間`;
  if (min % 1440 === 0) return `${min / 1440}日`;
  const h = Math.floor(min / 60);
  return min % 60 === 0 ? `${h}時間` : `${h}時間${min % 60}分`;
}

/** 受付締切の選択肢のラベル。 */
export function leadTimeLabel(min: number): string {
  return min > 0 ? `開始の${formatDuration(min)}前まで` : "開始直前まで";
}

/** 曜日の絞り込みの表示（"平日" / "土・日" / "月・水・金"）。 */
export function dowsLabel(dows: number[]): string {
  const set = new Set(dows);
  if (set.size === 5 && [1, 2, 3, 4, 5].every((d) => set.has(d))) return "平日";
  return DOW_ORDER.filter((d) => set.has(d))
    .map(dowLabel)
    .join("・");
}

function rangeLabel(
  s: LinkSchedule,
  fmt: (ymd: string) => string,
): string {
  if (s.from && s.to) return `${fmt(s.from)}〜${fmt(s.to)}`;
  if (s.from) return `${fmt(s.from)}から`;
  if (s.to) return `${fmt(s.to)}まで`;
  return "";
}

function listWithRest(items: string[], max: number, unit: string): string {
  if (items.length <= max) return items.join("・");
  return `${items.slice(0, max).join("・")} ほか${items.length - max}${unit}`;
}

/** 時間帯の表示（"14:15〜16:00 の間" / "14:15 以降" / "16:00 まで"）。 */
function timeWindowLabel(s: LinkSchedule): string {
  if (s.timeFrom && s.timeTo) return `${s.timeFrom}〜${s.timeTo} の間`;
  return s.timeFrom ? `${s.timeFrom} 以降` : `${s.timeTo} まで`;
}

/** 枠限定の枠一覧の短い表示（"10/21(水) 14:15・16:15"）。 */
export function slotsLabel(
  slots: ScheduleSlot[],
  today: string,
  maxDates = 3,
): string {
  const groups = groupSlotsByDate(slots);
  const shown = groups
    .slice(0, maxDates)
    .map((g) => `${formatShortDate(g.date, today)} ${g.times.join("・")}`);
  const rest = groups
    .slice(maxDates)
    .reduce((n, g) => n + g.times.length, 0);
  return rest > 0 ? `${shown.join(" / ")} ほか${rest}枠` : shown.join(" / ");
}

/** 管理画面向けの設定内容の要約（1要素 = 1項目）。 */
export function describeSchedule(s: LinkSchedule, today: string): string[] {
  const short = (ymd: string) => formatShortDate(ymd, today);
  const out: string[] = [];
  switch (s.mode) {
    case "always":
      out.push("営業日はいつでも");
      break;
    case "range":
      out.push(rangeLabel(s, short) || "期間が未入力");
      break;
    case "dates":
      out.push(
        s.dates.length ? listWithRest(s.dates.map(short), 4, "日") : "日付が未選択",
      );
      break;
    case "slots":
      out.push(
        s.slots.length
          ? `${slotsLabel(s.slots, today)}（全${s.slots.length}枠）`
          : "枠が未登録",
      );
      break;
  }
  if ((s.mode === "always" || s.mode === "range") && s.dows.length) {
    out.push(`毎週 ${dowsLabel(s.dows)}`);
  }
  if (s.mode !== "slots" && (s.timeFrom || s.timeTo)) {
    out.push(
      s.timeFrom && s.timeFrom === s.timeTo
        ? `${s.timeFrom} 開始のみ`
        : `${timeWindowLabel(s)}に開始`,
    );
  }
  if (s.slotCapacity != null) out.push(`各枠 ${s.slotCapacity}件まで`);
  if (s.maxBookings != null) out.push(`先着 ${s.maxBookings}件`);
  if (s.leadMinutes > 0) out.push(`${leadTimeLabel(s.leadMinutes)}受付`);
  if (s.openAt || s.closeAt) {
    const open = s.openAt ? formatShortDateTime(s.openAt, today) : "";
    const close = s.closeAt ? formatShortDateTime(s.closeAt, today) : "";
    out.push(`受付期間 ${open}〜${close}`);
  }
  return out;
}

/** 公開ページでお客様に見せる案内（1要素 = 1行）。枠限定の枠そのものは一覧で見せる。 */
export function publicScheduleNotices(
  s: LinkSchedule,
  today: string,
  opts: { remaining?: number | null } = {},
): string[] {
  const long = (ymd: string) => formatLongDate(ymd, today);
  const out: string[] = [];
  if (s.mode === "range") {
    out.push(`ご予約いただける期間：${rangeLabel(s, long)}`);
  }
  if (s.mode === "dates") {
    const upcoming = s.dates.filter((d) => d >= today).map(long);
    if (upcoming.length) {
      out.push(`ご予約いただける日：${listWithRest(upcoming, 6, "日")}`);
    }
  }
  if ((s.mode === "always" || s.mode === "range") && s.dows.length) {
    out.push(`ご予約いただける曜日：${dowsLabel(s.dows)}`);
  }
  if (s.mode !== "slots" && (s.timeFrom || s.timeTo)) {
    out.push(
      s.timeFrom && s.timeFrom === s.timeTo
        ? `ご予約いただける時間：${s.timeFrom} 開始`
        : `ご予約いただける時間：${timeWindowLabel(s)}に開始`,
    );
  }
  if (s.closeAt) {
    out.push(`受付締切：${formatLongDateTime(s.closeAt, today)}`);
  }
  if (s.leadMinutes > 0) {
    out.push(`ご予約は${leadTimeLabel(s.leadMinutes)}承ります`);
  }
  if (s.maxBookings != null) {
    out.push(
      opts.remaining != null
        ? `先着${s.maxBookings}名様限定（残り${opts.remaining}名様）`
        : `先着${s.maxBookings}名様限定`,
    );
  }
  return out;
}
