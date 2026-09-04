// 物販の金額・ポイント・クーポン計算の共通ロジック（サーバ/クライアント両用・純粋関数）。
// price は税抜（円）。表示・請求は税込で計算する。

export type PriceLike = { price: number; taxRate: number };

/** Stripe の JPY 最小決済額（円）。これ未満の請求は Checkout が受け付けない。 */
export const STRIPE_MIN_CHARGE_JPY = 50;

/** 税込単価（円・四捨五入）。 */
export function taxInclusiveUnit(price: number, taxRate: number): number {
  return Math.round(price * (1 + taxRate / 100));
}

/**
 * セールの割引率(%)。通常価格(compareAtPrice)が販売価格より高いときだけ 1 以上。
 * 例: 3800 → 3200 なら 16。
 */
export function discountPercent(
  price: number,
  compareAtPrice: number | null | undefined,
): number {
  if (!compareAtPrice || compareAtPrice <= price || compareAtPrice <= 0) return 0;
  return Math.round((1 - price / compareAtPrice) * 100);
}

export type CartLine = {
  productId: number;
  name: string;
  price: number; // 税抜単価
  taxRate: number;
  qty: number;
};

export type OrderTotals = {
  subtotal: number; // 税抜小計
  taxTotal: number;
  itemsTotal: number; // 税込商品合計
  couponDiscount: number; // クーポン値引き（税込商品合計から）
  shippingFee: number;
  payable: number; // ポイント利用前の支払額（itemsTotal - couponDiscount + shippingFee）
  pointsUsed: number; // ポイント利用（1pt = 1円）
  total: number; // 請求総額（payable - pointsUsed）
  pointsEarned: number;
};

/**
 * 配送時の実送料を求める。送料無料しきい値（税込商品合計が threshold 以上で無料）を考慮。
 * pickup（店頭受取）など送料不要のケースは baseShippingFee=0 を渡すこと。
 */
export function effectiveShipping(
  baseShippingFee: number,
  itemsTotalIncl: number,
  freeShippingThreshold: number,
): number {
  if (baseShippingFee <= 0) return 0;
  if (freeShippingThreshold > 0 && itemsTotalIncl >= freeShippingThreshold)
    return 0;
  return baseShippingFee;
}

/**
 * カート行 + 送料 + ポイント付与率 + 値引き から金額を確定する。
 * 税は税込単価ベースで行ごとに丸めるため、Stripe の line_items と完全一致する。
 * baseShippingFee は「配送が選ばれている場合の送料」。pickup のときは 0 を渡す。
 * freeShippingThreshold > 0 かつ 税込商品合計が threshold 以上なら送料無料
 * （送料無料判定はクーポン値引き前の税込商品合計で行う）。
 *
 * 値引きの順序: 税込商品合計 → クーポン値引き → 送料加算 → ポイント利用。
 * ポイント付与は「値引き後の税抜相当額」（税抜小計 - クーポン値引き - ポイント利用）に
 * 付与率を掛けて切り捨て。ポイントで払った分にはポイントが付かない。
 */
export function computeTotals(
  lines: CartLine[],
  baseShippingFee: number,
  pointRatePercent: number,
  freeShippingThreshold = 0,
  extras: { couponDiscount?: number; pointsUsed?: number } = {},
): OrderTotals {
  let subtotal = 0;
  let itemsTotal = 0;
  for (const l of lines) {
    const unitIncl = taxInclusiveUnit(l.price, l.taxRate);
    subtotal += l.price * l.qty;
    itemsTotal += unitIncl * l.qty;
  }
  const taxTotal = itemsTotal - subtotal;
  const empty = lines.length === 0;
  // 商品が無ければ値引き・送料も発生しない（空カートへの送料加算を防ぐ）。
  const couponDiscount = empty
    ? 0
    : Math.max(0, Math.min(Math.floor(extras.couponDiscount ?? 0), itemsTotal));
  const shippingFee = empty
    ? 0
    : effectiveShipping(baseShippingFee, itemsTotal, freeShippingThreshold);
  const payable = itemsTotal - couponDiscount + shippingFee;
  const pointsUsed = empty
    ? 0
    : Math.max(0, Math.min(Math.floor(extras.pointsUsed ?? 0), payable));
  const total = payable - pointsUsed;
  const earnBase = Math.max(0, subtotal - couponDiscount - pointsUsed);
  const pointsEarned =
    pointRatePercent > 0 ? Math.floor((earnBase * pointRatePercent) / 100) : 0;
  return {
    subtotal,
    taxTotal,
    itemsTotal,
    couponDiscount,
    shippingFee,
    payable,
    pointsUsed,
    total,
    pointsEarned,
  };
}

/**
 * 利用ポイントを確定する（クライアントの表示とサーバの確定で同じ関数を使う）。
 *  - 残高・支払額（ポイント利用前）を超えない。小数・負数は切り捨て/0。
 *  - 全額ポイント払い（残り 0 円）は可。残りが 1〜49 円になる場合は Stripe の
 *    最小決済額を満たすよう、残りがちょうど 50 円になる額まで自動で減らす。
 */
export function clampPointsUsage(
  requested: number,
  balance: number,
  payable: number,
): number {
  if (!Number.isFinite(requested) || requested <= 0) return 0;
  let pts = Math.floor(
    Math.min(requested, Math.max(0, balance), Math.max(0, payable)),
  );
  const remaining = payable - pts;
  if (remaining > 0 && remaining < STRIPE_MIN_CHARGE_JPY) {
    pts = Math.max(0, payable - STRIPE_MIN_CHARGE_JPY);
  }
  return pts;
}

// ---- クーポン ----

export type CouponLike = {
  type: string; // percent | fixed
  value: number;
  maxDiscount?: number | null;
};

/** クーポンの値引き額（円）。0 以上、税込商品合計以下。 */
export function couponDiscountAmount(
  coupon: CouponLike,
  itemsTotalIncl: number,
): number {
  if (itemsTotalIncl <= 0 || coupon.value <= 0) return 0;
  let d: number;
  if (coupon.type === "percent") {
    d = Math.floor((itemsTotalIncl * Math.min(100, coupon.value)) / 100);
    if (coupon.maxDiscount && coupon.maxDiscount > 0) {
      d = Math.min(d, coupon.maxDiscount);
    }
  } else {
    d = coupon.value;
  }
  return Math.max(0, Math.min(d, itemsTotalIncl));
}

export type CouponRule = CouponLike & {
  isActive: boolean;
  minSubtotal: number;
  startsAt?: Date | string | null;
  expiresAt?: Date | string | null;
  usageLimit?: number | null;
  usedCount: number;
};

export type CouponEvaluation =
  | { ok: true; discount: number }
  | { ok: false; reason: string };

/** クーポンの利用可否を判定（DB非依存の純粋関数）。ok なら値引き額を返す。 */
export function evaluateCoupon(
  coupon: CouponRule,
  itemsTotalIncl: number,
  now: Date = new Date(),
): CouponEvaluation {
  if (!coupon.isActive) {
    return { ok: false, reason: "このクーポンは現在ご利用いただけません" };
  }
  const t = now.getTime();
  if (coupon.startsAt && new Date(coupon.startsAt).getTime() > t) {
    return { ok: false, reason: "このクーポンはまだ利用開始前です" };
  }
  if (coupon.expiresAt && new Date(coupon.expiresAt).getTime() < t) {
    return { ok: false, reason: "このクーポンは有効期限が切れています" };
  }
  if (coupon.usageLimit != null && coupon.usedCount >= coupon.usageLimit) {
    return { ok: false, reason: "このクーポンは利用上限に達しました" };
  }
  if (coupon.minSubtotal > 0 && itemsTotalIncl < coupon.minSubtotal) {
    return {
      ok: false,
      reason: `${formatYen(coupon.minSubtotal)}以上のお買い上げでご利用いただけます`,
    };
  }
  const discount = couponDiscountAmount(coupon, itemsTotalIncl);
  if (discount <= 0) {
    return { ok: false, reason: "値引き額が0円のため適用できません" };
  }
  return { ok: true, discount };
}

/** クーポンの内容を短く表す（例: "10%OFF（上限¥2,000）" / "¥500引き"）。 */
export function describeCoupon(coupon: CouponLike): string {
  if (coupon.type === "percent") {
    const cap =
      coupon.maxDiscount && coupon.maxDiscount > 0
        ? `（上限${formatYen(coupon.maxDiscount)}）`
        : "";
    return `${coupon.value}%OFF${cap}`;
  }
  return `${formatYen(coupon.value)}引き`;
}

/** クーポンコードの正規化（前後空白除去・全角→半角・大文字化）。 */
export function normalizeCouponCode(raw: string): string {
  return toHalfWidthAlnum(raw).trim().toUpperCase().replace(/\s+/g, "");
}

// ---- 会員照合 ----

/** 全角英数字を半角に変換する。 */
export function toHalfWidthAlnum(s: string): string {
  return s.replace(/[Ａ-Ｚａ-ｚ０-９]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xfee0),
  );
}

/**
 * 電話番号の照合用に数字だけを取り出す（全角数字・ハイフン・空白・括弧を除去）。
 * "090-1111-2222" と "０９０１１１１２２２２" が同一視される。
 */
export function normalizePhoneDigits(raw: string | null | undefined): string {
  if (!raw) return "";
  return toHalfWidthAlnum(raw).replace(/\D/g, "");
}

/** legalInfo(JSON文字列) を安全にパース。 */
export function parseLegalInfo(
  raw: string | null | undefined,
): Record<string, string> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    if (v && typeof v === "object") return v as Record<string, string>;
  } catch {
    /* ignore */
  }
  return {};
}

const yen = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
  maximumFractionDigits: 0,
});

/** 1234 -> "¥1,234" */
export function formatYen(n: number): string {
  return yen.format(n);
}

/** 商品の imageUrls(JSON文字列) を配列にパースする。 */
export function parseImageUrls(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    if (Array.isArray(v)) return v.filter((x) => typeof x === "string");
  } catch {
    // 旧データで改行/カンマ区切りの可能性に一応対応
    return raw
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

export const ORDER_STATUS_LABELS: Record<string, string> = {
  received: "受付",
  preparing: "準備中",
  ready: "受渡準備完了",
  completed: "完了",
  cancelled: "キャンセル",
};

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: "未決済",
  paid: "決済済",
  cancelled: "キャンセル",
  refunded: "返金済",
};

export const FULFILLMENT_LABELS: Record<string, string> = {
  pickup: "店頭受取",
  shipping: "配送",
};

export const STOCK_MOVEMENT_LABELS: Record<string, string> = {
  in: "入荷",
  out: "販売",
  waste: "廃棄",
  adjust: "棚卸調整",
};

export const POINT_TX_LABELS: Record<string, string> = {
  earn: "付与",
  redeem: "利用",
  adjust: "調整",
};

export const COUPON_TYPE_LABELS: Record<string, string> = {
  percent: "％割引",
  fixed: "円引き",
};
