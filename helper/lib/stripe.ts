import "server-only";
import Stripe from "stripe";

// Stripe クライアントは遅延生成にする。ビルド時（next build のルート収集）に
// 環境変数が無くても import で落とさないため、関数呼び出し時に初めて検証する。
let cached: Stripe | null = null;

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY が未設定です。物販決済を使うには環境変数を設定してください。",
    );
  }
  if (!cached) {
    cached = new Stripe(key, { apiVersion: "2025-02-24.acacia" });
  }
  return cached;
}

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

/** 公開ページの絶対URL基点。末尾スラッシュ無し。 */
export function appBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  );
}
