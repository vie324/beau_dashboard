"use server";

import { z } from "zod";
import { db } from "@/helper/lib/db";
import {
  signMemberToken,
  verifyMemberToken,
} from "@/feature/storefront/lib/memberToken";
import { normalizePhoneDigits, toHalfWidthAlnum } from "@/helper/utils/retail";

const verifySchema = z.object({
  slug: z.string().trim().min(1),
  identifier: z
    .string()
    .trim()
    .min(1, "会員番号（診察券番号）またはメールアドレスを入力してください")
    .max(120),
  phone: z.string().trim().min(1, "電話番号を入力してください").max(40),
});

export type MemberProfile = {
  name: string;
  code: string | null;
  phone: string | null;
  email: string | null;
  postalCode: string | null;
  address: string | null;
  pointsBalance: number;
};

export type VerifyMemberResult =
  | { ok: true; token: string; member: MemberProfile }
  | { ok: false; error: string };

const NOT_FOUND =
  "会員情報が見つかりませんでした。会員番号（またはメールアドレス）と、ご登録の電話番号をご確認ください。";

function toProfile(c: {
  name: string;
  code: string | null;
  phone: string | null;
  email: string | null;
  postalCode: string | null;
  address: string | null;
  pointsBalance: number;
}): MemberProfile {
  return {
    name: c.name,
    code: c.code,
    phone: c.phone,
    email: c.email,
    postalCode: c.postalCode,
    address: c.address,
    pointsBalance: c.pointsBalance,
  };
}

const customerSelect = {
  id: true,
  name: true,
  code: true,
  phone: true,
  email: true,
  postalCode: true,
  address: true,
  pointsBalance: true,
} as const;

/**
 * 公開販売ページの会員確認。会員番号（顧客 code）またはメールアドレス と
 * 電話番号の両方が一致した顧客だけを本人とみなし、署名付きトークンを発行する。
 * どちらが違うかは伝えない（総当たりの手がかりを減らす）。
 */
export async function verifyMember(
  input: z.infer<typeof verifySchema>,
): Promise<VerifyMemberResult> {
  const parsed = verifySchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "入力内容を確認してください",
    };
  }
  const { slug, identifier, phone } = parsed.data;
  const shop = await db.shop.findFirst({
    where: { storeSlug: slug, storeActive: true, deletedAt: null },
    select: { id: true },
  });
  if (!shop) return { ok: false, error: "この販売ページはご利用いただけません" };

  const ident = toHalfWidthAlnum(identifier).trim();
  const phoneDigits = normalizePhoneDigits(phone);
  if (phoneDigits.length < 8) {
    return { ok: false, error: "電話番号の形式が正しくありません" };
  }

  const candidates = await db.customer.findMany({
    where: {
      shopId: shop.id,
      deletedAt: null,
      OR: [
        { code: ident },
        { email: { equals: ident, mode: "insensitive" } },
      ],
    },
    select: customerSelect,
    take: 10,
  });
  const match = candidates.find(
    (c) => normalizePhoneDigits(c.phone) === phoneDigits,
  );
  if (!match) return { ok: false, error: NOT_FOUND };

  return {
    ok: true,
    token: signMemberToken({ customerId: match.id, shopId: shop.id }),
    member: toProfile(match),
  };
}

export type MemberPointRow = {
  id: number;
  type: string;
  points: number;
  reason: string | null;
  orderNo: string | null;
  createdAt: number;
};

export type MemberOrderRow = {
  id: number;
  orderNo: string;
  status: string;
  paymentStatus: string;
  fulfillment: string;
  total: number;
  discountAmount: number;
  pointsUsed: number;
  pointsEarned: number;
  createdAt: number;
  items: { name: string; qty: number }[];
};

export type MemberSummaryResult =
  | {
      ok: true;
      member: MemberProfile;
      points: MemberPointRow[];
      orders: MemberOrderRow[];
      shop: { pointRatePercent: number; allowPointRedeem: boolean };
    }
  | { ok: false; error: string };

/**
 * マイページ / チェックアウト用の会員サマリ。トークンで顧客を解決し、最新のポイント残高・
 * ポイント履歴・注文履歴を返す。トークンが無効・期限切れなら再確認を促す。
 */
export async function getMemberSummary(input: {
  slug: string;
  token: string;
}): Promise<MemberSummaryResult> {
  const slug = String(input?.slug ?? "").trim();
  const claims = verifyMemberToken(input?.token);
  if (!slug || !claims) {
    return { ok: false, error: "会員確認の有効期限が切れました。もう一度会員確認をしてください" };
  }
  const shop = await db.shop.findFirst({
    where: { storeSlug: slug, storeActive: true, deletedAt: null },
    select: { id: true, pointRatePercent: true, allowPointRedeem: true },
  });
  if (!shop || shop.id !== claims.shopId) {
    return { ok: false, error: "この販売ページはご利用いただけません" };
  }
  const customer = await db.customer.findFirst({
    where: { id: claims.customerId, shopId: shop.id, deletedAt: null },
    select: customerSelect,
  });
  if (!customer) {
    return { ok: false, error: "会員情報が見つかりません。もう一度会員確認をしてください" };
  }

  const [points, orders] = await Promise.all([
    db.pointTransaction.findMany({
      where: { shopId: shop.id, customerId: customer.id },
      orderBy: { id: "desc" },
      take: 30,
      select: {
        id: true,
        type: true,
        points: true,
        reason: true,
        createdAt: true,
        order: { select: { orderNo: true } },
      },
    }),
    db.order.findMany({
      where: { shopId: shop.id, customerId: customer.id, deletedAt: null },
      orderBy: { id: "desc" },
      take: 20,
      select: {
        id: true,
        orderNo: true,
        status: true,
        paymentStatus: true,
        fulfillment: true,
        total: true,
        discountAmount: true,
        pointsUsed: true,
        pointsEarned: true,
        createdAt: true,
        items: { select: { name: true, qty: true } },
      },
    }),
  ]);

  return {
    ok: true,
    member: toProfile(customer),
    points: points.map((p) => ({
      id: p.id,
      type: p.type,
      points: p.points,
      reason: p.reason,
      orderNo: p.order?.orderNo ?? null,
      createdAt: p.createdAt.getTime(),
    })),
    orders: orders.map((o) => ({
      id: o.id,
      orderNo: o.orderNo,
      status: o.status,
      paymentStatus: o.paymentStatus,
      fulfillment: o.fulfillment,
      total: o.total,
      discountAmount: o.discountAmount,
      pointsUsed: o.pointsUsed,
      pointsEarned: o.pointsEarned,
      createdAt: o.createdAt.getTime(),
      items: o.items,
    })),
    shop: {
      pointRatePercent: shop.pointRatePercent,
      allowPointRedeem: shop.allowPointRedeem,
    },
  };
}
