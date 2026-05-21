import { dayOfWeekFromYmd } from "@/helper/utils/time";

export type ShopHoursDefaults = {
  openTime: string | null;
  closeTime: string | null;
  breakStart: string | null;
  breakEnd: string | null;
};

export type DowOverride = {
  closed?: boolean;
  openTime?: string;
  closeTime?: string;
  breakStart?: string;
  breakEnd?: string;
};

export type HoursByDow = Partial<Record<string, DowOverride>>;

export type DateOverrideType = "closed" | "morning" | "afternoon";

export type DateOverride = {
  type: DateOverrideType;
  note?: string;
};

export type DateOverrides = Partial<Record<string, DateOverride>>;

export type ResolvedHours = {
  isClosed: boolean;
  openTime: string | null;
  closeTime: string | null;
  breakStart: string | null;
  breakEnd: string | null;
};

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DOW_KEY_RE = /^[0-6]$/;
const YMD_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_OVERRIDE_TYPES: DateOverrideType[] = [
  "closed",
  "morning",
  "afternoon",
];

function isHhmm(v: unknown): v is string {
  return typeof v === "string" && HHMM_RE.test(v);
}

/** Best-effort parse of the TEXT JSON; invalid entries are dropped silently. */
export function parseHoursByDow(raw: string | null | undefined): HoursByDow {
  if (!raw) return {};
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: HoursByDow = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (!DOW_KEY_RE.test(k)) continue;
    if (!val || typeof val !== "object" || Array.isArray(val)) continue;
    const row = val as Record<string, unknown>;
    if (row.closed === true) {
      out[k] = { closed: true };
      continue;
    }
    const entry: DowOverride = {};
    if (isHhmm(row.openTime)) entry.openTime = row.openTime;
    if (isHhmm(row.closeTime)) entry.closeTime = row.closeTime;
    if (isHhmm(row.breakStart)) entry.breakStart = row.breakStart;
    if (isHhmm(row.breakEnd)) entry.breakEnd = row.breakEnd;
    if (Object.keys(entry).length > 0) out[k] = entry;
  }
  return out;
}

/** Serialise overrides back to a compact JSON string (or null when empty). */
export function serializeHoursByDow(overrides: HoursByDow): string | null {
  const cleaned: HoursByDow = {};
  for (const [k, v] of Object.entries(overrides)) {
    if (!v) continue;
    if (v.closed) {
      cleaned[k] = { closed: true };
      continue;
    }
    const entry: DowOverride = {};
    if (isHhmm(v.openTime)) entry.openTime = v.openTime;
    if (isHhmm(v.closeTime)) entry.closeTime = v.closeTime;
    if (isHhmm(v.breakStart)) entry.breakStart = v.breakStart;
    if (isHhmm(v.breakEnd)) entry.breakEnd = v.breakEnd;
    if (Object.keys(entry).length > 0) cleaned[k] = entry;
  }
  return Object.keys(cleaned).length === 0 ? null : JSON.stringify(cleaned);
}

/** Best-effort parse of the date-override JSON. */
export function parseDateOverrides(raw: string | null | undefined): DateOverrides {
  if (!raw) return {};
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: DateOverrides = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (!YMD_KEY_RE.test(k)) continue;
    if (!val || typeof val !== "object" || Array.isArray(val)) continue;
    const row = val as Record<string, unknown>;
    const type = row.type;
    if (typeof type !== "string" || !DATE_OVERRIDE_TYPES.includes(type as DateOverrideType))
      continue;
    const entry: DateOverride = { type: type as DateOverrideType };
    if (typeof row.note === "string" && row.note.trim()) {
      entry.note = row.note.trim().slice(0, 100);
    }
    out[k] = entry;
  }
  return out;
}

export function serializeDateOverrides(overrides: DateOverrides): string | null {
  const cleaned: DateOverrides = {};
  for (const [k, v] of Object.entries(overrides)) {
    if (!v) continue;
    if (!YMD_KEY_RE.test(k)) continue;
    if (!DATE_OVERRIDE_TYPES.includes(v.type)) continue;
    const entry: DateOverride = { type: v.type };
    if (v.note && v.note.trim()) entry.note = v.note.trim().slice(0, 100);
    cleaned[k] = entry;
  }
  return Object.keys(cleaned).length === 0 ? null : JSON.stringify(cleaned);
}

/** Apply the day-of-week layer; helper for resolveHoursForDate. */
function resolveByDow(
  shop: ShopHoursDefaults & { hoursByDow?: string | null },
  dateStr: string,
): ResolvedHours {
  const overrides = parseHoursByDow(shop.hoursByDow);
  const dow = dayOfWeekFromYmd(dateStr);
  const o = overrides[String(dow)];
  if (o?.closed) {
    return {
      isClosed: true,
      openTime: null,
      closeTime: null,
      breakStart: null,
      breakEnd: null,
    };
  }
  return {
    isClosed: false,
    openTime: o?.openTime ?? shop.openTime ?? null,
    closeTime: o?.closeTime ?? shop.closeTime ?? null,
    breakStart: o?.breakStart ?? shop.breakStart ?? null,
    breakEnd: o?.breakEnd ?? shop.breakEnd ?? null,
  };
}

/**
 * Resolve effective hours for a specific JST date.
 *   priority: date override (closed/morning/afternoon) → day-of-week → shop default
 * - morning  : 午前休 — opens at breakEnd, no break.
 * - afternoon: 午後休 — closes at breakStart, no break.
 * If the partial type is used on a day without a defined break, the entire day is closed.
 */
export function resolveHoursForDate(
  shop: ShopHoursDefaults & {
    hoursByDow?: string | null;
    dateOverrides?: string | null;
  },
  dateStr: string,
): ResolvedHours {
  const base = resolveByDow(shop, dateStr);
  const dateOv = parseDateOverrides(shop.dateOverrides)[dateStr];
  if (!dateOv) return base;
  if (dateOv.type === "closed") {
    return {
      isClosed: true,
      openTime: null,
      closeTime: null,
      breakStart: null,
      breakEnd: null,
    };
  }
  if (base.isClosed) return base;
  if (dateOv.type === "morning") {
    if (!base.breakEnd) {
      return {
        isClosed: true,
        openTime: null,
        closeTime: null,
        breakStart: null,
        breakEnd: null,
      };
    }
    return {
      isClosed: false,
      openTime: base.breakEnd,
      closeTime: base.closeTime,
      breakStart: null,
      breakEnd: null,
    };
  }
  if (dateOv.type === "afternoon") {
    if (!base.breakStart) {
      return {
        isClosed: true,
        openTime: null,
        closeTime: null,
        breakStart: null,
        breakEnd: null,
      };
    }
    return {
      isClosed: false,
      openTime: base.openTime,
      closeTime: base.breakStart,
      breakStart: null,
      breakEnd: null,
    };
  }
  return base;
}
