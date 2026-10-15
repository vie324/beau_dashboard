import { toLocalDateString } from "@/helper/utils/time";

/**
 * 期間限定ポイント（物販のポイント付与率を期間を区切って変える設定）。
 *
 * Shop.pointCampaigns に JSON (TEXT) の配列で保存する。null / 空 = 期間限定なし
 * （通年 Shop.pointRatePercent で付与）。販売ページの表示・決済時の付与ポイントの
 * 確定・管理画面のすべてから使うので、ここには純粋な関数だけを置く。
 *
 *  - 期間は JST の日付で、開始日・終了日とも含む（11/1〜11/30 なら 11/30 23:59 まで）
 *  - 期間中は通常の付与率の「代わりに」この付与率で付与する（下げる設定も可）
 *  - 期間が重なったときは付与率の高い方を使う
 *  - 付与ポイントは注文作成時の付与率で確定する（決済が期間終了後でも変わらない）
 */
export type PointCampaign = {
  /** 表示名（例: 「秋のポイントアップ」）。空なら「期間限定」と表示する */
  label: string;
  /** 期間中の付与率（%）。税抜小計に対する率 */
  ratePercent: number;
  /** 開始日・終了日（JST "YYYY-MM-DD"、両端を含む） */
  startDate: string;
  endDate: string;
};

/** 登録できる期間限定ポイントの件数の上限。 */
export const MAX_POINT_CAMPAIGNS = 20;
export const POINT_CAMPAIGN_LABEL_MAX = 40;

export type PointCampaignStatus = "active" | "upcoming" | "ended";

export const POINT_CAMPAIGN_STATUS_LABEL: Record<PointCampaignStatus, string> = {
  active: "実施中",
  upcoming: "予定",
  ended: "終了",
};

/** "YYYY-MM-DD" として実在する日付か。 */
export function isYmd(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
  );
}

/**
 * 保存済みの JSON を読む。壊れた JSON・形式の合わない行は捨てる
 * （読めない行で決済や販売ページを止めないため。付与率は通常に戻るだけ）。
 * 開始日の昇順で返す。
 */
export function parsePointCampaigns(raw: string | null | undefined): PointCampaign[] {
  if (!raw) return [];
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(v)) return [];
  const out: PointCampaign[] = [];
  for (const row of v) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const rate = r.ratePercent;
    if (typeof rate !== "number" || !Number.isInteger(rate) || rate < 0 || rate > 100)
      continue;
    if (!isYmd(r.startDate) || !isYmd(r.endDate) || r.startDate > r.endDate) continue;
    out.push({
      label: typeof r.label === "string" ? r.label.slice(0, POINT_CAMPAIGN_LABEL_MAX) : "",
      ratePercent: rate,
      startDate: r.startDate,
      endDate: r.endDate,
    });
  }
  return sortPointCampaigns(out).slice(0, MAX_POINT_CAMPAIGNS);
}

/** 開始日 → 終了日の昇順に並べる（元の配列は変えない）。 */
export function sortPointCampaigns(list: PointCampaign[]): PointCampaign[] {
  return [...list].sort(
    (a, b) =>
      a.startDate.localeCompare(b.startDate) || a.endDate.localeCompare(b.endDate),
  );
}

/** 保存用の JSON。空なら null（= 期間限定なし）。 */
export function serializePointCampaigns(list: PointCampaign[]): string | null {
  if (list.length === 0) return null;
  return JSON.stringify(
    sortPointCampaigns(list).map((c) => ({
      label: c.label.trim(),
      ratePercent: c.ratePercent,
      startDate: c.startDate,
      endDate: c.endDate,
    })),
  );
}

/** today（JST "YYYY-MM-DD"）時点での状態。 */
export function pointCampaignStatus(
  c: Pick<PointCampaign, "startDate" | "endDate">,
  today: string,
): PointCampaignStatus {
  if (today < c.startDate) return "upcoming";
  if (today > c.endDate) return "ended";
  return "active";
}

export type ResolvedPointRate = {
  /** いま使う付与率（%）。期間限定の実施中はその率、なければ通常の率 */
  ratePercent: number;
  /** 通常の付与率（Shop.pointRatePercent） */
  baseRatePercent: number;
  /** 実施中の期間限定ポイント（無ければ null） */
  campaign: PointCampaign | null;
};

/**
 * now 時点の付与率を決める。実施中の期間限定があればその率（重なっていれば高い方）、
 * 無ければ通常の付与率。日付の判定は JST。
 */
export function resolvePointRate(
  baseRatePercent: number,
  campaigns: PointCampaign[],
  now: Date = new Date(),
): ResolvedPointRate {
  const today = toLocalDateString(now);
  let campaign: PointCampaign | null = null;
  for (const c of campaigns) {
    if (pointCampaignStatus(c, today) !== "active") continue;
    if (!campaign || c.ratePercent > campaign.ratePercent) campaign = c;
  }
  return {
    ratePercent: campaign ? campaign.ratePercent : baseRatePercent,
    baseRatePercent,
    campaign,
  };
}

/** 次に始まる期間限定（無ければ null）。管理画面の案内用。 */
export function nextPointCampaign(
  campaigns: PointCampaign[],
  now: Date = new Date(),
): PointCampaign | null {
  const today = toLocalDateString(now);
  return (
    sortPointCampaigns(campaigns).find(
      (c) => pointCampaignStatus(c, today) === "upcoming",
    ) ?? null
  );
}

/** "2026-11-30" -> "11/30" */
export function formatMonthDay(ymd: string): string {
  const [, m, d] = ymd.split("-").map(Number);
  return `${m}/${d}`;
}

/** "11/1〜11/30"（同日なら "11/1"）。年をまたぐ・別の年なら年も付ける。 */
export function formatCampaignPeriod(
  c: Pick<PointCampaign, "startDate" | "endDate">,
  now: Date = new Date(),
): string {
  const thisYear = toLocalDateString(now).slice(0, 4);
  const sameYear =
    c.startDate.slice(0, 4) === thisYear && c.endDate.slice(0, 4) === thisYear;
  const fmt = (ymd: string) =>
    sameYear ? formatMonthDay(ymd) : `${ymd.slice(0, 4)}/${formatMonthDay(ymd)}`;
  if (c.startDate === c.endDate) return fmt(c.startDate);
  return `${fmt(c.startDate)}〜${fmt(c.endDate)}`;
}

/** 販売ページに出す名前（空なら「期間限定」）。 */
export function pointCampaignLabel(c: Pick<PointCampaign, "label">): string {
  return c.label.trim() || "期間限定";
}
