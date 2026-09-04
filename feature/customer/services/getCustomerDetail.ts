import { db } from "@/helper/lib/db";

/** 顧客のポイント台帳（新しい順・最大100件）。顧客詳細モーダル用。 */
export async function getCustomerPointHistory(shopId: number, customerId: number) {
  const rows = await db.pointTransaction.findMany({
    where: { shopId, customerId },
    orderBy: { id: "desc" },
    take: 100,
    select: {
      id: true,
      type: true,
      points: true,
      reason: true,
      createdAt: true,
      order: { select: { orderNo: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    points: r.points,
    reason: r.reason,
    orderNo: r.order?.orderNo ?? null,
    createdAt: r.createdAt,
  }));
}

export type CustomerPointRow = Awaited<
  ReturnType<typeof getCustomerPointHistory>
>[number];
