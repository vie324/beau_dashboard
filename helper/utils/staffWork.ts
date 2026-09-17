const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Parse the workDates TEXT JSON to a sorted, de-duped array of "YYYY-MM-DD". */
export function parseWorkDates(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return [
      ...new Set(
        v.filter((x): x is string => typeof x === "string" && YMD_RE.test(x)),
      ),
    ].sort();
  } catch {
    return [];
  }
}

/** Serialize work dates back to compact JSON (or null when empty). */
export function serializeWorkDates(dates: string[]): string | null {
  const clean = [...new Set(dates.filter((d) => YMD_RE.test(d)))].sort();
  return clean.length === 0 ? null : JSON.stringify(clean);
}

/**
 * Whether a staff member is available on the given JST date.
 * 常勤 (spotMode=false) は常に true。臨時 (spotMode=true) は出勤日のみ。
 */
export function staffWorksOn(
  staff: { spotMode?: boolean; workDates?: string | null },
  dateStr: string,
): boolean {
  if (!staff.spotMode) return true;
  return parseWorkDates(staff.workDates).includes(dateStr);
}

/** 予約表の列を残すかの判定に使う、予約行の最小限の形。 */
export type StaffColumnAppointment = {
  staffId: number | null;
  kind?: string | null;
  status?: number | null;
};

/** 3 キャンセル / 4 当日キャンセル / 99 無断キャンセル */
const CANCELLED_STATUSES = new Set([3, 4, 99]);

/**
 * 「まだ生きている通常予約」か。
 * 時間ブロック (kind="block") と、キャンセル/無断キャンセルは含めない。
 */
export function isLiveAppointment(row: StaffColumnAppointment): boolean {
  if ((row.kind ?? "appointment") === "block") return false;
  return !CANCELLED_STATUSES.has(row.status ?? 0);
}

export type StaffColumnCandidate = {
  id: number;
  spotMode?: boolean;
  workDates?: string | null;
};

/**
 * その日の予約表に列を出すスタッフを選ぶ（予約管理ボードと印刷で共通）。
 *
 * - 常勤              : 常に表示
 * - 臨時（出勤日）     : 表示
 * - 臨時（出勤日以外） : 原則 非表示。ただし その日に生きている通常予約が
 *   残っている場合だけ、その予約が画面から消えてしまわないよう例外的に表示し
 *   `offDuty: true` を付ける（画面上は「勤務外」と表示する）。
 *   時間ブロックやキャンセル済み予約しか無い日は表示しない。
 */
export function pickVisibleStaffs<T extends StaffColumnCandidate>(
  staffs: T[],
  dateStr: string,
  appointments: StaffColumnAppointment[],
): (T & { offDuty: boolean })[] {
  return staffs
    .map((s) => ({ ...s, offDuty: !staffWorksOn(s, dateStr) }))
    .filter(
      (s) =>
        !s.offDuty ||
        appointments.some((a) => a.staffId === s.id && isLiveAppointment(a)),
    );
}
