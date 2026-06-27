import { db } from "@/helper/lib/db";

/** 店舗の注文一覧（明細・顧客紐付け込み）。管理画面用。 */
export async function getOrders(shopId: number, limit = 200) {
  return db.order.findMany({
    where: { shopId, deletedAt: null },
    orderBy: { id: "desc" },
    take: limit,
    select: {
      id: true,
      orderNo: true,
      buyerName: true,
      buyerPhone: true,
      buyerEmail: true,
      buyerCode: true,
      fulfillment: true,
      shippingAddress: true,
      paymentStatus: true,
      status: true,
      subtotal: true,
      taxTotal: true,
      shippingFee: true,
      pointsUsed: true,
      pointsEarned: true,
      total: true,
      note: true,
      paidAt: true,
      createdAt: true,
      customer: { select: { id: true, name: true, code: true } },
      items: {
        select: { id: true, name: true, unitPrice: true, taxRate: true, qty: true },
      },
    },
  });
}

export type OrderRow = Awaited<ReturnType<typeof getOrders>>[number];

/** 売上サマリ（決済済みのみ）。期間は当日/今月。 */
export async function getSalesSummary(shopId: number) {
  const paid = await db.order.findMany({
    where: { shopId, deletedAt: null, paymentStatus: "paid" },
    select: { total: true, subtotal: true, paidAt: true },
  });

  const now = new Date();
  const ymJst = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
  }).format(now);
  const ymdJst = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  let todayTotal = 0;
  let monthTotal = 0;
  let allTotal = 0;
  let paidCount = 0;
  for (const o of paid) {
    allTotal += o.total;
    paidCount += 1;
    if (!o.paidAt) continue;
    const d = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(o.paidAt);
    if (d === ymdJst) todayTotal += o.total;
    if (d.startsWith(ymJst)) monthTotal += o.total;
  }
  return { todayTotal, monthTotal, allTotal, paidCount };
}
