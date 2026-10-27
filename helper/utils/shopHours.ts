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

// closed 全日休 / morning 午前休 / afternoon 午後休 /
// custom 特別営業（その日だけの営業時間。定休日に入れればその日だけ営業する）
export type DateOverrideType = "closed" | "morning" | "afternoon" | "custom";

export type DateOverride = {
  type: DateOverrideType;
  note?: string;
  // 以下は custom のときだけ使う。開店・閉店は必須、休憩は任意（空なら休憩なし）。
  openTime?: string;
  closeTime?: string;
  breakStart?: string;
  breakEnd?: string;
};

export type DateOverrides = Partial<Record<string, DateOverride>>;

export type ResolvedHours = {
  isClosed: boolean;
  openTime: string | null;
  closeTime: string | null;
  breakStart: string | null;
  breakEnd: string | null;
  /** その日に日付の設定（休診・特別営業 等）が効いているときの中身。予約表の表示用。 */
  dateOverride?: DateOverride;
};

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DOW_KEY_RE = /^[0-6]$/;
const YMD_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_OVERRIDE_TYPES: DateOverrideType[] = [
  "closed",
  "morning",
  "afternoon",
  "custom",
];

function isHhmm(v: unknown): v is string {
  return typeof v === "string" && HHMM_RE.test(v);
}

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/**
 * 特別営業（custom）の営業時間の入力チェック。問題なければ null、あればその理由。
 * 開店 < 閉店 が必須。休憩は両方空（休憩なし）か、開店 < 休憩開始 < 休憩終了 < 閉店。
 */
export function customHoursError(h: {
  openTime?: string | null;
  closeTime?: string | null;
  breakStart?: string | null;
  breakEnd?: string | null;
}): string | null {
  if (!isHhmm(h.openTime) || !isHhmm(h.closeTime)) {
    return "特別営業の開始・終了時刻を入力してください";
  }
  const open = toMin(h.openTime);
  const close = toMin(h.closeTime);
  if (open >= close) return "特別営業の終了時刻は開始時刻より後にしてください";
  const hasBs = Boolean(h.breakStart);
  const hasBe = Boolean(h.breakEnd);
  if (!hasBs && !hasBe) return null;
  if (!isHhmm(h.breakStart) || !isHhmm(h.breakEnd)) {
    return "休憩は開始・終了の両方を入力してください（休憩なしなら両方空欄）";
  }
  const bs = toMin(h.breakStart);
  const be = toMin(h.breakEnd);
  if (!(open < bs && bs < be && be < close)) {
    return "休憩は営業時間の内側で、開始 < 終了 になるように入力してください";
  }
  return null;
}

/** 1件分を保存形に整える。不正な特別営業（時刻なし・前後逆）は null。 */
function normalizeDateOverride(row: Record<string, unknown>): DateOverride | null {
  const type = row.type;
  if (typeof type !== "string" || !DATE_OVERRIDE_TYPES.includes(type as DateOverrideType))
    return null;
  const entry: DateOverride = { type: type as DateOverrideType };
  if (entry.type === "custom") {
    const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
    const hours = {
      openTime: str(row.openTime),
      closeTime: str(row.closeTime),
      breakStart: str(row.breakStart),
      breakEnd: str(row.breakEnd),
    };
    if (customHoursError(hours) != null) return null;
    entry.openTime = hours.openTime;
    entry.closeTime = hours.closeTime;
    if (hours.breakStart && hours.breakEnd) {
      entry.breakStart = hours.breakStart;
      entry.breakEnd = hours.breakEnd;
    }
  }
  if (typeof row.note === "string" && row.note.trim()) {
    entry.note = row.note.trim().slice(0, 100);
  }
  return entry;
}

/** "08:30" → "8:30"（画面表示用） */
function hmLabel(hhmm: string): string {
  return hhmm.replace(/^0(\d)/, "$1");
}

/**
 * 日付の設定を短い文言にする（一覧・予約表の表示用）。
 * 例: 特別営業 8:30〜15:30 / 特別営業 9:00〜18:00（休憩 12:00〜13:00）/ 休診 / 午前休
 */
export function describeDateOverride(ov: DateOverride): string {
  switch (ov.type) {
    case "closed":
      return "休診";
    case "morning":
      return "午前休";
    case "afternoon":
      return "午後休";
    case "custom": {
      const hours = `${hmLabel(ov.openTime ?? "")}〜${hmLabel(ov.closeTime ?? "")}`;
      const rest =
        ov.breakStart && ov.breakEnd
          ? `（休憩 ${hmLabel(ov.breakStart)}〜${hmLabel(ov.breakEnd)}）`
          : "";
      return `特別営業 ${hours}${rest}`;
    }
  }
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
    const entry = normalizeDateOverride(val as Record<string, unknown>);
    if (entry) out[k] = entry;
  }
  return out;
}

export function serializeDateOverrides(overrides: DateOverrides): string | null {
  const cleaned: DateOverrides = {};
  for (const [k, v] of Object.entries(overrides)) {
    if (!v) continue;
    if (!YMD_KEY_RE.test(k)) continue;
    const entry = normalizeDateOverride(v as Record<string, unknown>);
    if (entry) cleaned[k] = entry;
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
 *   priority: date override (closed/morning/afternoon/custom) → day-of-week → shop default
 * - morning  : 午前休 — opens at breakEnd, no break.
 * - afternoon: 午後休 — closes at breakStart, no break.
 * - custom   : 特別営業 — the override's own hours/break, even on a closed day of week.
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
  return { ...applyDateOverride(base, dateOv), dateOverride: dateOv };
}

function applyDateOverride(base: ResolvedHours, dateOv: DateOverride): ResolvedHours {
  if (dateOv.type === "custom") {
    return {
      isClosed: false,
      openTime: dateOv.openTime ?? null,
      closeTime: dateOv.closeTime ?? null,
      breakStart: dateOv.breakStart ?? null,
      breakEnd: dateOv.breakEnd ?? null,
    };
  }
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

export type DateOverrideGroup = {
  date: string;
  override: DateOverride;
  shopIds: number[];
};

/**
 * 店舗ごとの日付設定を「日付 × 同じ内容」でまとめる（設定画面の特別営業日一覧用）。
 * fromDate 以降（その日を含む）だけを、日付順に返す。同じ日の中は店舗の並び順。
 */
export function groupDateOverrides(
  shops: { id: number; dateOverrides?: string | null }[],
  fromDate: string,
): DateOverrideGroup[] {
  const groups = new Map<string, DateOverrideGroup>();
  for (const shop of shops) {
    for (const [date, ov] of Object.entries(parseDateOverrides(shop.dateOverrides))) {
      if (!ov || date < fromDate) continue;
      const key = `${date}|${JSON.stringify(ov)}`;
      const g = groups.get(key);
      if (g) g.shopIds.push(shop.id);
      else groups.set(key, { date, override: ov, shopIds: [shop.id] });
    }
  }
  return [...groups.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * 1店舗分の日付設定を書き換えて、保存用の JSON（空なら null）を返す。
 * remove の日付を消してから set を入れる（日付を変えた編集・対象から外した店舗・削除で使う）。
 */
export function editDateOverrides(
  raw: string | null | undefined,
  change: {
    remove?: string | null;
    set?: { date: string; override: DateOverride } | null;
  },
): string | null {
  const next = parseDateOverrides(raw);
  if (change.remove) delete next[change.remove];
  if (change.set) next[change.set.date] = change.set.override;
  return serializeDateOverrides(next);
}
