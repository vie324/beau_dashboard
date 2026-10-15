import { formatYen } from "@/helper/utils/retail";
import { formatMonthDay } from "@/helper/utils/pointCampaign";

/**
 * 販売ページで打ち出す「お買い物の特典」（送料・ポイント・店頭受取）。
 * 上部の帯・ヒーロー・ご利用ガイド・商品ページで同じ言い回しにするため、
 * 文言はここで店舗設定から組み立てる（表示側はアイコンを付けるだけ）。
 */
export type BenefitKind = "pickup" | "shipping" | "points" | "campaign" | "redeem";

export type Benefit = {
  kind: BenefitKind;
  /** 短い見出し（帯・チップ用） */
  label: string;
  /** 補足（ご利用ガイド用） */
  detail: string;
};

export type BenefitShop = {
  shippingFee?: number;
  freeShippingThreshold?: number;
  pointRatePercent?: number;
  allowPointRedeem?: boolean;
  pointCampaign?: {
    label: string;
    ratePercent: number;
    baseRatePercent: number;
    endDate: string;
  } | null;
};

export function storeBenefits(shop: BenefitShop): Benefit[] {
  const out: Benefit[] = [];
  const campaign = shop.pointCampaign ?? null;
  if (campaign) {
    out.push({
      kind: "campaign",
      label: `${campaign.label} ${formatMonthDay(campaign.endDate)}まで ポイント${campaign.ratePercent}%還元`,
      detail:
        campaign.baseRatePercent > 0
          ? `期間中は通常${campaign.baseRatePercent}%のポイントが${campaign.ratePercent}%に。`
          : `期間中はお買い物で${campaign.ratePercent}%のポイントが貯まります。`,
    });
  }
  if (shop.shippingFee !== undefined) {
    const fee = shop.shippingFee;
    const threshold = shop.freeShippingThreshold ?? 0;
    if (fee <= 0) {
      out.push({ kind: "shipping", label: "全国送料無料", detail: "配送の送料はいつでも無料です。" });
    } else if (threshold > 0) {
      out.push({
        kind: "shipping",
        label: `${formatYen(threshold)}以上で送料無料`,
        detail: `税込${formatYen(threshold)}以上のお買い上げで送料無料（通常${formatYen(fee)}）。`,
      });
    } else {
      out.push({ kind: "shipping", label: `送料 ${formatYen(fee)}`, detail: `配送の送料は一律${formatYen(fee)}です。` });
    }
  }
  const rate = shop.pointRatePercent ?? 0;
  if (rate > 0 && !campaign) {
    out.push({
      kind: "points",
      label: `ポイント${rate}%還元`,
      detail: `お買い物で${rate}%のポイントが貯まります（1pt=1円）。`,
    });
  }
  out.push({
    kind: "pickup",
    label: "店頭受取OK",
    detail: "ご来院時に受付でお渡し。店頭受取なら送料はかかりません。",
  });
  if (shop.allowPointRedeem) {
    out.push({
      kind: "redeem",
      label: "ポイントでお支払いOK",
      detail: "貯まったポイントは 1pt=1円 でお支払いに使えます。",
    });
  }
  return out;
}
