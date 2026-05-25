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
      createdAt: true,
    },
  });
  customers.sort(compareByCustomerCode);
  if (customers.length === 0) return [];

  const ids = customers.map((c) => c.id);

  const [visits, lastVisits] = await Promise.all([
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
    db.appointment.groupBy({
      by: ["customerId"],
      where: {
        shopId,
        customerId: { in: ids },
        deletedAt: null,
        status: { notIn: [3, 4, 99] },
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

  return customers.map((c) => ({
    ...c,
    visitCount: visitMap.get(c.id) ?? 0,
    lastVisitAt: lastMap.get(c.id) ?? null,
  }));
}

export type CustomerRow = Awaited<ReturnType<typeof getCustomers>>[number];
