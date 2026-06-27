import { db } from "@/helper/lib/db";
import { compareByCustomerCode } from "@/helper/utils/customerSort";

/**
 * 店舗の顧客一覧 + 来店回数（完了予約 status=2 の件数）+ 最終来店日時。
 * appointments は別クエリで集計し、findMany には載せない（行数が増えた場合の重さ回避）。
 */
export async function getCustomers(shopId: number) {
  const customers = await db.customer.findMany({
    where: { shopId, deletedAt: null },
    select: {
      id: true,
      code: true,
      name: true,
      kana: true,
      phone: true,
      email: true,
      postalCode: true,
      address: true,
      gender: true,
      birthday: true,
      note: true,
      pointsBalance: true,
      createdAt: true,
    },
  });
  customers.sort(compareByCustomerCode);
  if (customers.length === 0) return [];

  const ids = customers.map((c) => c.id);

  const [visits, purchases, lastVisits] = await Promise.all([
    db.appointment.groupBy({
      by: ["customerId"],
      where: {
        shopId,
        customerId: { in: ids },
        deletedAt: null,
        status: 2, // 完了のみカウント
      },
      _count: { _all: true },
    }),
    db.order.groupBy({
      by: ["customerId"],
      where: {
        shopId,
        customerId: { in: ids },
        deletedAt: null,
        paymentStatus: "paid",
      },
      _count: { _all: true },
      _sum: { total: true },
    }),
    db.appointment.groupBy({
      by: ["customerId"],
      where: {
        shopId,
        customerId: { in: ids },
        deletedAt: null,
        // 「最終来店」は完了(status=2)のみ。未来の予約(0)や施術中(1)を
        // 来店日として拾わないようにする（visitCount と整合）。
        status: 2,
      },
      _max: { startAt: true },
    }),
  ]);

  const visitMap = new Map<number, number>();
  for (const v of visits) {
    if (v.customerId != null) visitMap.set(v.customerId, v._count._all);
  }
  const lastMap = new Map<number, Date | null>();
  for (const l of lastVisits) {
    if (l.customerId != null) lastMap.set(l.customerId, l._max.startAt);
  }
  const purchaseMap = new Map<number, { count: number; total: number }>();
  for (const p of purchases) {
    if (p.customerId != null)
      purchaseMap.set(p.customerId, {
        count: p._count._all,
        total: p._sum.total ?? 0,
      });
  }

  return customers.map((c) => ({
    ...c,
    visitCount: visitMap.get(c.id) ?? 0,
    lastVisitAt: lastMap.get(c.id) ?? null,
    purchaseCount: purchaseMap.get(c.id)?.count ?? 0,
    purchaseTotal: purchaseMap.get(c.id)?.total ?? 0,
  }));
}

export type CustomerRow = Awaited<ReturnType<typeof getCustomers>>[number];
