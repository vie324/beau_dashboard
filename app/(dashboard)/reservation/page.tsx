import { PageHeader } from "@/components/layout/PageHeader";
import { getActiveShopId } from "@/helper/lib/shop-context";
import { toLocalDateString } from "@/helper/utils/time";
import { getReservations } from "@/feature/reservation/services/getReservations";
import { getReservationFormData } from "@/feature/reservation/services/getReservationFormData";
import { getShopHours } from "@/feature/reservation/services/getShopHours";
import { ReservationBoard } from "@/feature/reservation/components/ReservationBoard";

export const dynamic = "force-dynamic";

export default async function ReservationPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date: dateParam } = await searchParams;
  const today = toLocalDateString();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateParam ?? "")
    ? (dateParam as string)
    : today;

  const shopId = await getActiveShopId();
  const [reservations, formData, shopHours] = await Promise.all([
    getReservations(shopId, date),
    getReservationFormData(shopId),
    getShopHours(shopId, date),
  ]);

  return (
    <>
      <PageHeader
        title="予約管理"
        description="店舗ごとの予約をタイムラインで管理します。スタッフの重複予約は自動でブロックされます。"
      />
      <ReservationBoard
        date={date}
        today={today}
        reservations={reservations}
        formData={formData}
        shopHours={shopHours}
      />
    </>
  );
}
