// All date strings are computed in Asia/Tokyo to avoid UTC drift on the server.
// NEVER use `new Date().toISOString().split("T")[0]` — that yields a UTC date.

const TZ = "Asia/Tokyo";

/** Returns the JST calendar date of `d` as "YYYY-MM-DD". */
export function toLocalDateString(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Returns "HH:mm" of `d` in JST. */
export function toLocalTimeString(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

/** "YYYY-MM-DD" + "HH:mm" (interpreted as JST wall-clock) -> absolute Date. */
export function jstDateTimeToDate(dateStr: string, timeStr: string): Date {
  const [y, m, day] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);
  // JST is UTC+9 (no DST in Japan).
  const utcMs = Date.UTC(y, m - 1, day, hh - 9, mm, 0, 0);
  return new Date(utcMs);
}

export function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * 60_000);
}

/** Human label like "5月16日(金)" in JST. */
export function formatJpDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 3, 0, 0));
  const wd = new Intl.DateTimeFormat("ja-JP", {
    timeZone: TZ,
    weekday: "short",
  }).format(date);
  return `${m}月${d}日(${wd})`;
}

export function shiftDateString(dateStr: string, deltaDays: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  base.setUTCDate(base.getUTCDate() + deltaDays);
  return toLocalDateString(base);
}

/** Minutes since midnight JST for a given absolute Date. */
export function jstMinutesOfDay(d: Date): number {
  const t = toLocalTimeString(d);
  const [hh, mm] = t.split(":").map(Number);
  return hh * 60 + mm;
}
