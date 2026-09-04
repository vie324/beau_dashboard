"use client";

// チェックアウトで入力した購入者情報を次回のために端末に保存する（slug 単位）。
// 会員確認をしていないお客様でも、2回目以降の入力を省けるようにするための軽量な仕組み。

export type BuyerInfo = {
  buyerName: string;
  buyerPhone: string;
  buyerEmail: string;
  buyerCode: string;
  fulfillment: "pickup" | "shipping";
  shippingAddress: string;
};

function key(slug: string): string {
  return `beau_buyer_${slug}`;
}

export function readBuyerInfo(slug: string): BuyerInfo | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key(slug));
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (!v || typeof v !== "object") return null;
    const str = (x: unknown) => (typeof x === "string" ? x : "");
    return {
      buyerName: str(v.buyerName),
      buyerPhone: str(v.buyerPhone),
      buyerEmail: str(v.buyerEmail),
      buyerCode: str(v.buyerCode),
      fulfillment: v.fulfillment === "shipping" ? "shipping" : "pickup",
      shippingAddress: str(v.shippingAddress),
    };
  } catch {
    return null;
  }
}

export function writeBuyerInfo(slug: string, info: BuyerInfo): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key(slug), JSON.stringify(info));
  } catch {
    /* ignore quota */
  }
}

export function clearBuyerInfo(slug: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key(slug));
  } catch {
    /* ignore */
  }
}
