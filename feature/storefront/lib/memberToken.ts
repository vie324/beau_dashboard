import "server-only";
import crypto from "node:crypto";

/**
 * 公開販売ページの「会員確認」トークン。
 *
 * お客様が 会員番号（またはメール）+ 電話番号 で本人確認に成功すると、
 * customerId / shopId を HMAC 署名付きで封入したトークンを発行する。
 * 以後のチェックアウト（ポイント利用）・マイページ参照はこのトークンで顧客を解決するため、
 * クライアントから任意の customerId を送らせない。
 *
 * 署名鍵は管理画面セッションと同じ AUTH_SECRET。有効期限 12 時間。
 */

export const MEMBER_TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

export type MemberClaims = { customerId: number; shopId: number };

function secret(): string {
  return process.env.AUTH_SECRET ?? "insecure-dev-secret";
}

function sign(body: string): string {
  return crypto
    .createHmac("sha256", secret())
    .update(`member:${body}`)
    .digest("base64url");
}

export function signMemberToken(
  claims: MemberClaims,
  now: number = Date.now(),
): string {
  const body = Buffer.from(
    JSON.stringify({
      c: claims.customerId,
      s: claims.shopId,
      exp: now + MEMBER_TOKEN_TTL_MS,
    }),
  ).toString("base64url");
  return `${body}.${sign(body)}`;
}

/** 署名・期限を検証し、正当なら claims を返す。不正・期限切れは null。 */
export function verifyMemberToken(
  token: string | null | undefined,
  now: number = Date.now(),
): MemberClaims | null {
  if (!token || typeof token !== "string") return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  const expected = sign(body);
  if (
    mac.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))
  ) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString());
    if (
      !Number.isInteger(parsed.c) ||
      !Number.isInteger(parsed.s) ||
      typeof parsed.exp !== "number" ||
      parsed.exp < now
    ) {
      return null;
    }
    return { customerId: parsed.c, shopId: parsed.s };
  } catch {
    return null;
  }
}
