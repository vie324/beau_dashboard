import { redirect } from "next/navigation";
import { getCurrentUser } from "@/helper/lib/auth";
import { getActiveShopId } from "@/helper/lib/shop-context";
import { db } from "@/helper/lib/db";
import { toLocalDateString } from "@/helper/utils/time";
import { staffWorksOn } from "@/helper/utils/staffWork";
import { getReservations } from "@/feature/reservation/services/getReservations";
import { getReservationFormData } from "@/feature/reservation/services/getReservationFormData";
import { getShopHours } from "@/feature/reservation/services/getShopHours";
import { PrintTimeline } from "@/feature/reservation/components/PrintTimeline";

export const dynamic = "force-dynamic";

export default async function ReservationPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; session?: string }>;
}) {
  if (!(await getCurrentUser())) redirect("/login?next=/reservation/print");

  const { date: dateParam, session: sessionParam } = await searchParams;
  const today = toLocalDateString();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateParam ?? "")
    ? (dateParam as string)
    : today;
  const initialSession: "all" | "morning" | "afternoon" =
    sessionParam === "morning" || sessionParam === "afternoon"
      ? sessionParam
      : "all";

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

  // 臨時スタッフは出勤日でなく、その日に予約も無ければ列を出さない（予約管理ボードと同じ挙動）。
  const visibleStaffs = formData.staffs.filter((s) => {
    if (!staffWorksOn(s, date)) {
      const hasAppt = reservations.some((x) => x.staffId === s.id);
      if (!hasAppt) return false;
    }
    return true;
  });

  return (
    <PrintTimeline
      date={date}
      reservations={reservations}
      formData={{ ...formData, staffs: visibleStaffs }}
      shopHours={shopHours}
      shopName={shop?.name ?? ""}
      initialSession={initialSession}
    />
  );
}
