// 物販の金額・ポイント計算の共通ロジック（サーバ/クライアント両用・純粋関数）。
// price は税抜（円）。表示・請求は税込で計算する。

export type PriceLike = { price: number; taxRate: number };

/** 税込単価（円・四捨五入）。 */
export function taxInclusiveUnit(price: number, taxRate: number): number {
  return Math.round(price * (1 + taxRate / 100));
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
  shippingFee: number;
  total: number; // 請求総額
  pointsEarned: number;
};

/**
 * カート行 + 送料 + ポイント付与率 から金額を確定する。
 * 税は税込単価ベースで行ごとに丸めるため、Stripe の line_items と完全一致する。
 */
export function computeTotals(
  lines: CartLine[],
  shippingFee: number,
  pointRatePercent: number,
): OrderTotals {
  let subtotal = 0;
  let itemsTotal = 0;
  for (const l of lines) {
    const unitIncl = taxInclusiveUnit(l.price, l.taxRate);
    subtotal += l.price * l.qty;
    itemsTotal += unitIncl * l.qty;
  }
  const taxTotal = itemsTotal - subtotal;
  const total = itemsTotal + shippingFee;
  const pointsEarned =
    pointRatePercent > 0 ? Math.floor((subtotal * pointRatePercent) / 100) : 0;
  return { subtotal, taxTotal, itemsTotal, shippingFee, total, pointsEarned };
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
