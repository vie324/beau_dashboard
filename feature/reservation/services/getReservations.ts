import { db } from "@/helper/lib/db";
import { jstDateTimeToDate } from "@/helper/utils/time";

export type ReservationRow = Awaited<
  ReturnType<typeof getReservations>
>[number];

/** Appointments for one shop on a JST calendar day ("YYYY-MM-DD"). */
export async function getReservations(shopId: number, dateStr: string) {
  const dayStart = jstDateTimeToDate(dateStr, "00:00");
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  return db.appointment.findMany({
    where: {
      shopId,
      deletedAt: null,
      startAt: { gte: dayStart, lt: dayEnd },
    },
    orderBy: { startAt: "asc" },
    include: {
      staff: { select: { id: true, name: true, color: true } },
      customer: { select: { id: true, name: true, phone: true } },
      menu: { select: { id: true, name: true, durationMin: true } },
      visitSource: {
        select: { id: true, name: true, color: true, labelTextColor: true },
      },
    },
  });
}
