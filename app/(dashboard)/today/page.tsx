import { PageHeader } from "@/components/layout/PageHeader";
import { getActiveShopId } from "@/helper/lib/shop-context";
import { toLocalDateString, formatJpDate } from "@/helper/utils/time";
import { getReservations } from "@/feature/reservation/services/getReservations";
import {
  TodayDashboard,
  type TodayStats,
} from "@/feature/dashboard/components/TodayDashboard";

export const dynamic = "force-dynamic";

const byStart = (a: { startAt: Date }, b: { startAt: Date }) =>
  new Date(a.startAt).getTime() - new Date(b.startAt).getTime();

export default async function TodayPage() {
  const today = toLocalDateString();
  const shopId = await getActiveShopId();
  const reservations = await getReservations(shopId, today);

  // 時間ブロックは集計対象外（顧客予約のみ）。
  const appts = reservations.filter((r) => r.kind !== "block");
  const has = (...statuses: number[]) =>
    appts.filter((r) => statuses.includes(r.status));

  const stats: TodayStats = {
    total: appts.length,
    waiting: has(0).length,
    inService: has(1).length,
    done: has(2).length,
    cancelled: has(3, 4).length,
    noShow: has(99).length,
    unconfirmed: appts.filter(
      (r) => !r.confirmed && ![3, 4, 99].includes(r.status),
    ).length,
    sales: has(2).reduce((sum, r) => sum + (r.sales ?? 0), 0),
  };

  const upcoming = has(0).sort(byStart);
  const inService = has(1).sort(byStart);

  return (
    <>
      <PageHeader title="今日" description={`${formatJpDate(today)} の予約状況`} />
      <TodayDashboard
        date={today}
        stats={stats}
        upcoming={upcoming}
        inService={inService}
      />
    </>
  );
}
