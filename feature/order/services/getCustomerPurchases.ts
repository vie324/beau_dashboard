import { db } from "@/helper/lib/db";

/**
 * 顧客一覧に物販の購入実績（決済済の件数・累計額）とポイント残高を載せるための集計。
 * customer 一覧（getCustomers）と id で突合して使う。
 */
export async function getCustomerPurchaseStats(
  shopId: number,
  customerIds: number[],
): Promise<
  Map<number, { orderCount: number; totalSpent: number }>
> {
  const map = new Map<number, { orderCount: number; totalSpent: number }>();
  if (customerIds.length === 0) return map;

  const grouped = await db.order.groupBy({
    by: ["customerId"],
    where: {
      shopId,
      deletedAt: null,
      paymentStatus: "paid",
      customerId: { in: customerIds },
    },
    _count: { _all: true },
    _sum: { total: true },
  });
  for (const g of grouped) {
    if (g.customerId == null) continue;
    map.set(g.customerId, {
      orderCount: g._count._all,
      totalSpent: g._sum.total ?? 0,
    });
  }
  return map;
}

/** 1顧客の購入履歴（明細付き）。顧客詳細モーダル用。 */
export async function getCustomerOrders(shopId: number, customerId: number) {
  return db.order.findMany({
    where: { shopId, customerId, deletedAt: null },
    orderBy: { id: "desc" },
    take: 50,
    select: {
      id: true,
      orderNo: true,
      total: true,
      pointsEarned: true,
      paymentStatus: true,
      status: true,
      paidAt: true,
      createdAt: true,
      items: { select: { name: true, qty: true } },
    },
  });
}
