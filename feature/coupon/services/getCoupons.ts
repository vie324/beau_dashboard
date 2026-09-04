import { db } from "@/helper/lib/db";

/** 店舗のクーポン一覧（管理画面用。無効・期限切れも含む）。 */
export async function getCoupons(shopId: number) {
  return db.coupon.findMany({
    where: { shopId, deletedAt: null },
    orderBy: [{ isActive: "desc" }, { id: "desc" }],
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
      showOnStore: true,
      note: true,
      createdAt: true,
    },
  });
}

export type CouponRow = Awaited<ReturnType<typeof getCoupons>>[number];

/**
 * 公開販売ページに掲示するクーポン（showOnStore かつ現在有効なもの）。
 * 金額条件はカート次第なので判定せず、期間・回数・有効フラグだけで絞る。
 */
export async function getPublicCoupons(shopId: number, now: Date = new Date()) {
  const rows = await db.coupon.findMany({
    where: {
      shopId,
      deletedAt: null,
      isActive: true,
      showOnStore: true,
      OR: [{ startsAt: null }, { startsAt: { lte: now } }],
      AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gte: now } }] }],
    },
    orderBy: { id: "desc" },
    take: 3,
    select: {
      code: true,
      name: true,
      type: true,
      value: true,
      minSubtotal: true,
      maxDiscount: true,
      expiresAt: true,
      usageLimit: true,
      usedCount: true,
    },
  });
  return rows
    .filter((c) => c.usageLimit == null || c.usedCount < c.usageLimit)
    .map((c) => ({
      code: c.code,
      name: c.name,
      type: c.type,
      value: c.value,
      minSubtotal: c.minSubtotal,
      maxDiscount: c.maxDiscount,
      expiresAt: c.expiresAt ? c.expiresAt.getTime() : null,
    }));
}

export type PublicCoupon = Awaited<ReturnType<typeof getPublicCoupons>>[number];
