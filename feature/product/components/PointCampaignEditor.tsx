"use client";

import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input, Label } from "@/components/ui/Input";
import { toLocalDateString } from "@/helper/utils/time";
import {
  MAX_POINT_CAMPAIGNS,
  POINT_CAMPAIGN_LABEL_MAX,
  POINT_CAMPAIGN_STATUS_LABEL,
  isYmd,
  pointCampaignStatus,
  type PointCampaign,
  type PointCampaignStatus,
} from "@/helper/utils/pointCampaign";

/** フォーム上の1行（入力途中の値を持つので数値も文字列のまま）。 */
export type CampaignRow = {
  key: number;
  label: string;
  rate: string;
  startDate: string;
  endDate: string;
};

let nextKey = 1;

export function toCampaignRows(list: PointCampaign[]): CampaignRow[] {
  return list.map((c) => ({
    key: nextKey++,
    label: c.label,
    rate: String(c.ratePercent),
    startDate: c.startDate,
    endDate: c.endDate,
  }));
}

/** 入力値を検証して保存用の配列にする。エラーは何件目かを添えて返す。 */
export function rowsToCampaigns(
  rows: CampaignRow[],
): { ok: true; campaigns: PointCampaign[] } | { ok: false; error: string } {
  const campaigns: PointCampaign[] = [];
  for (const [i, r] of rows.entries()) {
    const at = `（期間限定ポイント ${i + 1}件目）`;
    const rateText = r.rate.trim();
    if (!rateText) return { ok: false, error: `付与率を入力してください${at}` };
    const rate = Number(rateText);
    if (!Number.isInteger(rate) || rate < 0 || rate > 100) {
      return { ok: false, error: `付与率は0〜100%の整数で入力してください${at}` };
    }
    if (!isYmd(r.startDate) || !isYmd(r.endDate)) {
      return { ok: false, error: `開始日と終了日を入力してください${at}` };
    }
    if (r.startDate > r.endDate) {
      return { ok: false, error: `終了日は開始日以降の日付にしてください${at}` };
    }
    campaigns.push({
      label: r.label.trim(),
      ratePercent: rate,
      startDate: r.startDate,
      endDate: r.endDate,
    });
  }
  return { ok: true, campaigns };
}

const STATUS_CLASS: Record<PointCampaignStatus, string> = {
  active: "border-ok/40 bg-ok/10 text-ok",
  upcoming: "border-info/40 bg-info/10 text-info",
  ended: "border-line bg-elevated text-muted",
};

/** 販売ページ設定の「期間限定ポイント」欄。行の追加・編集・削除だけを受け持つ。 */
export function PointCampaignEditor({
  rows,
  onChange,
  baseRatePercent,
}: {
  rows: CampaignRow[];
  onChange: (rows: CampaignRow[]) => void;
  /** 通常の付与率（説明文に使う） */
  baseRatePercent: string;
}) {
  const today = toLocalDateString();

  const update = (key: number, patch: Partial<CampaignRow>) =>
    onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const remove = (key: number) => onChange(rows.filter((r) => r.key !== key));
  const add = () =>
    onChange([
      ...rows,
      { key: nextKey++, label: "", rate: "", startDate: today, endDate: "" },
    ]);

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <Label className="mb-0">期間限定ポイント</Label>
        <Button
          size="sm"
          variant="outline"
          onClick={add}
          disabled={rows.length >= MAX_POINT_CAMPAIGNS}
        >
          ＋ 期間を追加
        </Button>
      </div>
      <p className="mt-1 text-xs text-faint">
        期間中は通常の付与率（{baseRatePercent.trim() || "0"}%）の代わりに、ここで決めた付与率で付与します。
        開始日・終了日とも含みます。期間が重なる日は付与率の高い方になります。
      </p>

      {rows.length === 0 ? (
        <p className="mt-2 rounded-xl border border-dashed border-line px-3 py-3 text-center text-xs text-faint">
          登録はありません（通年、通常の付与率で付与します）
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {rows.map((r) => {
            const status =
              isYmd(r.startDate) && isYmd(r.endDate) && r.startDate <= r.endDate
                ? pointCampaignStatus(r, today)
                : null;
            return (
              <li
                key={r.key}
                className="rounded-xl border border-line bg-base/50 p-3"
              >
                <div className="flex items-center gap-2">
                  <Input
                    value={r.label}
                    onChange={(e) => update(r.key, { label: e.target.value })}
                    placeholder="名前（任意）例）秋のポイントアップ"
                    maxLength={POINT_CAMPAIGN_LABEL_MAX}
                    aria-label="期間限定ポイントの名前"
                  />
                  {status && (
                    <Badge className={"shrink-0 " + STATUS_CLASS[status]}>
                      {POINT_CAMPAIGN_STATUS_LABEL[status]}
                    </Badge>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => remove(r.key)}
                    className="shrink-0"
                    aria-label="この期間を削除"
                  >
                    削除
                  </Button>
                </div>
                <div className="mt-2 grid grid-cols-[5.5rem_1fr_1fr] gap-2">
                  <div>
                    <span className="mb-1 block text-[11px] text-muted">付与率（%）</span>
                    <Input
                      type="number"
                      inputMode="numeric"
                      value={r.rate}
                      onChange={(e) => update(r.key, { rate: e.target.value })}
                      placeholder="10"
                      min={0}
                      max={100}
                    />
                  </div>
                  <div className="min-w-0">
                    <span className="mb-1 block text-[11px] text-muted">開始日</span>
                    <Input
                      type="date"
                      value={r.startDate}
                      onChange={(e) => update(r.key, { startDate: e.target.value })}
                      className="date-input-tight"
                    />
                  </div>
                  <div className="min-w-0">
                    <span className="mb-1 block text-[11px] text-muted">終了日（その日まで）</span>
                    <Input
                      type="date"
                      value={r.endDate}
                      min={r.startDate || undefined}
                      onChange={(e) => update(r.key, { endDate: e.target.value })}
                      className="date-input-tight"
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
