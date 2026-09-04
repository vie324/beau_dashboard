import "server-only";
import type { Prisma, PrismaClient } from "@prisma/client";
import { evaluateCoupon, normalizeCouponCode } from "@/helper/utils/retail";

type Client = PrismaClient | Prisma.TransactionClient;

export type CouponLookup =
  | {
      ok: true;
      coupon: {
        id: number;
        code: string;
        name: string;
        type: string;
        value: number;
        maxDiscount: number;
        minSubtotal: number;
        usageLimit: number | null;
      };
      discount: number;
    }
  | { ok: false; error: string };

/**
 * チェックアウト用のクーポン解決。コードを正規化して店舗内で検索し、
 * 期間・回数・最低金額を検証して値引き額を返す（DB 参照 + 純粋関数 evaluateCoupon）。
 * プレビュー（previewCoupon）と注文確定（createCheckout）の両方で同じ判定を使う。
 */
export async function findCouponForCheckout(
  client: Client,
  shopId: number,
  rawCode: string,
  itemsTotalIncl: number,
  now: Date = new Date(),
): Promise<CouponLookup> {
  const code = normalizeCouponCode(rawCode);
  if (!code) return { ok: false, error: "クーポンコードを入力してください" };
  const coupon = await client.coupon.findFirst({
    where: { shopId, code, deletedAt: null },
    select: {
      id: true,
      code: true,
      name: true,
      type: true,
      value: true,
      minSubtotal: true,
      maxDiscount: true,
      startsAt: true,
      expiresAt: true,
      usageLimit: true,
      usedCount: true,
      isActive: true,
    },
  });
  if (!coupon) return { ok: false, error: "クーポンコードが正しくありません" };
  const ev = evaluateCoupon(coupon, itemsTotalIncl, now);
  if (!ev.ok) return { ok: false, error: ev.reason };
  return {
    ok: true,
    coupon: {
      id: coupon.id,
      code: coupon.code,
      name: coupon.name,
      type: coupon.type,
      value: coupon.value,
      maxDiscount: coupon.maxDiscount,
      minSubtotal: coupon.minSubtotal,
      usageLimit: coupon.usageLimit,
    },
    discount: ev.discount,
  };
}
