import { db } from "@/helper/lib/db";
import { jstDateTimeToDate } from "@/helper/utils/time";

const RESERVATION_INCLUDE = {
  staff: { select: { id: true, name: true, color: true } },
  equipment: { select: { id: true, name: true, color: true } },
  customer: { select: { id: true, name: true, phone: true, note: true } },
  menu: { select: { id: true, name: true, durationMin: true } },
  visitSource: {
    select: { id: true, name: true, color: true, labelTextColor: true },
  },
} as const;

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
    include: RESERVATION_INCLUDE,
  });
}

/**
 * Appointments for one shop over a JST date range of `days` days starting at
 * `startDateStr` ("YYYY-MM-DD"). Optionally restricted to a single staff.
 */
export async function getReservationsRange(
  shopId: number,
  startDateStr: string,
  days: number,
  staffId?: number,
) {
  const rangeStart = jstDateTimeToDate(startDateStr, "00:00");
  const rangeEnd = new Date(rangeStart.getTime() + days * 24 * 60 * 60 * 1000);

  return db.appointment.findMany({
    where: {
      shopId,
      deletedAt: null,
      ...(staffId != null ? { staffId } : {}),
      startAt: { gte: rangeStart, lt: rangeEnd },
    },
    orderBy: { startAt: "asc" },
    include: RESERVATION_INCLUDE,
  });
}
