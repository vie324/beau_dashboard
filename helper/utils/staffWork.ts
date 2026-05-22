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
