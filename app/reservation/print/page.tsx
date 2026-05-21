import { redirect } from "next/navigation";
import { getCurrentUser } from "@/helper/lib/auth";
import { getActiveShopId } from "@/helper/lib/shop-context";
import { db } from "@/helper/lib/db";
import { toLocalDateString } from "@/helper/utils/time";
import { getReservations } from "@/feature/reservation/services/getReservations";
import { getReservationFormData } from "@/feature/reservation/services/getReservationFormData";
import { getShopHours } from "@/feature/reservation/services/getShopHours";
import { PrintTimeline } from "@/feature/reservation/components/PrintTimeline";

export const dynamic = "force-dynamic";

export default async function ReservationPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  if (!(await getCurrentUser())) redirect("/login?next=/reservation/print");

  const { date: dateParam } = await searchParams;
  const today = toLocalDateString();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateParam ?? "")
    ? (dateParam as string)
    : today;

  const shopId = await getActiveShopId();
  const [reservations, formData, shopHours, shop] = await Promise.all([
    getReservations(shopId, date),
    getReservationFormData(shopId),
    getShopHours(shopId, date),
    db.shop.findFirst({
      where: { id: shopId, deletedAt: null },
      select: { name: true },
    }),
  ]);

  return (
    <PrintTimeline
      date={date}
      reservations={reservations}
      formData={formData}
      shopHours={shopHours}
      shopName={shop?.name ?? ""}
    />
  );
}
