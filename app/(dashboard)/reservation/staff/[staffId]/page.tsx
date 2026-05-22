import { notFound } from "next/navigation";
import { db } from "@/helper/lib/db";
import { getActiveShopId } from "@/helper/lib/shop-context";
import {
  toLocalDateString,
  shiftDateString,
  dayOfWeekFromYmd,
  jstMinutesOfDay,
} from "@/helper/utils/time";
import { getReservationsRange } from "@/feature/reservation/services/getReservations";
import { getReservationFormData } from "@/feature/reservation/services/getReservationFormData";
import { getShopHours } from "@/feature/reservation/services/getShopHours";
import { StaffWeekBoard } from "@/feature/reservation/components/StaffWeekBoard";

export const dynamic = "force-dynamic";

function parseHm(t?: string | null): number | null {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  if (!Number.isInteger(h) || !Number.isInteger(m)) return null;
  return h * 60 + m;
}

export default async function StaffWeekPage({
  params,
  searchParams,
}: {
  params: Promise<{ staffId: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const { staffId: staffIdParam } = await params;
  const staffId = Number(staffIdParam);
  if (!Number.isInteger(staffId)) notFound();

  const { date: dateParam } = await searchParams;
  const today = toLocalDateString();
  const refDate = /^\d{4}-\d{2}-\d{2}$/.test(dateParam ?? "")
    ? (dateParam as string)
    : today;

  const shopId = await getActiveShopId();
  const staff = await db.staff.findFirst({
    where: { id: staffId, shopId, deletedAt: null },
    select: { id: true, name: true, color: true },
  });
  if (!staff) notFound();

  // 月曜始まりの週。選択日を含む週の月曜を求める。
  const dow = dayOfWeekFromYmd(refDate); // 0=Sun..6=Sat
  const daysSinceMonday = (dow + 6) % 7;
  const weekStart = shiftDateString(refDate, -daysSinceMonday);
  const dayStrs = Array.from({ length: 7 }, (_, i) =>
    shiftDateString(weekStart, i),
  );

  const [reservations, formData, dayHours] = await Promise.all([
    getReservationsRange(shopId, weekStart, 7, staffId),
    getReservationFormData(shopId),
    Promise.all(dayStrs.map((d) => getShopHours(shopId, d))),
  ]);

  const days = dayStrs.map((dateStr, i) => {
    const h = dayHours[i];
    return {
      dateStr,
      dow: dayOfWeekFromYmd(dateStr),
      isClosed: h.isClosed,
      breakStartMin: parseHm(h.breakStart),
      breakEndMin: parseHm(h.breakEnd),
    };
  });

  // 週全体の時間窓: 各日の営業時間の最小開始〜最大終了。予約で自動拡張。
  let startMin = 24 * 60;
  let endMin = 0;
  for (let i = 0; i < 7; i++) {
    const h = dayHours[i];
    if (h.isClosed) continue;
    const o = parseHm(h.openTime);
    const c = parseHm(h.closeTime);
    if (o != null) startMin = Math.min(startMin, o);
    if (c != null) endMin = Math.max(endMin, c);
  }
  if (startMin >= endMin) {
    startMin = 9 * 60;
    endMin = 21 * 60;
  }
  for (const r of reservations) {
    const s = jstMinutesOfDay(new Date(r.startAt));
    const e = jstMinutesOfDay(new Date(r.endAt));
    if (s < startMin) startMin = Math.floor(s / 60) * 60;
    if (e > endMin) endMin = Math.ceil(e / 60) * 60;
  }
  startMin = Math.max(0, startMin);
  endMin = Math.min(24 * 60, endMin);

  return (
    <StaffWeekBoard
      staff={staff}
      weekStart={weekStart}
      refDate={refDate}
      today={today}
      days={days}
      startMin={startMin}
      endMin={endMin}
      reservations={reservations}
      formData={formData}
    />
  );
}
