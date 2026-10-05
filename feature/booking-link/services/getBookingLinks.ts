import { db } from "@/helper/lib/db";
import { getBookingScheduleSupport } from "@/helper/lib/schemaSupport";
import {
  BOOKING_LINK_COLUMNS,
  liveLinkBookingWhere,
} from "@/feature/booking-link/lib/linkDb";
import { toLocalDateString } from "@/helper/utils/time";
import {
  parseSchedule,
  scheduleState,
  type LinkSchedule,
  type ScheduleState,
} from "@/feature/booking-link/lib/schedule";

export type BookingLinkRow = {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  shopId: number | null;
  shopName: string | null;
  isActive: boolean;
  requireStaffSelection: boolean;
  allowOverflowAtBreak: boolean;
  allowOverflowAtClose: boolean;
  intervalMin: number;
  allowedMenuIds: number[];
  reminderEnabled: boolean;
  reminderHoursBefore: number;
  /** 受付する日時の制限（DDL 未適用なら常に制限なし） */
  schedule: LinkSchedule;
  /** このリンク経由の予約件数（キャンセル等を除く） */
  bookedCount: number;
  /** 受付の状態（受付期間・受付日の残り・先着の定員から判定。公開/停止は isActive） */
  state: ScheduleState;
};

function parseMenuIds(raw: string | null): number[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(Number).filter(Number.isInteger) : [];
  } catch {
    return [];
  }
}

function parseReminder(raw: string | null): {
  enabled: boolean;
  hoursBefore: number;
} {
  if (!raw) return { enabled: false, hoursBefore: 24 };
  try {
    const v = JSON.parse(raw);
    return {
      enabled: Boolean(v.enabled),
      hoursBefore: Number(v.hoursBefore) || 24,
    };
  } catch {
    return { enabled: false, hoursBefore: 24 };
  }
}

/**
 * Booking links for a brand. Resolves shop names via a separate query +
 * Map lookup (avoids fragile implicit joins; matches the project pattern).
 */
export async function getBookingLinks(
  brandId: number,
): Promise<BookingLinkRow[]> {
  const withSchedule = await getBookingScheduleSupport();
  const links = await db.bookingLink.findMany({
    where: { brandId, deletedAt: null },
    orderBy: { id: "asc" },
    select: { ...BOOKING_LINK_COLUMNS, schedule: withSchedule },
  });

  const shopIds = [
    ...new Set(
      links.map((l) => l.shopId).filter((v): v is number => v != null),
    ),
  ];
  const shops = shopIds.length
    ? await db.shop.findMany({
        where: { id: { in: shopIds } },
        select: { id: true, name: true },
      })
    : [];
  const shopName = new Map(shops.map((s) => [s.id, s.name]));

  const counts = links.length
    ? await db.appointment.groupBy({
        by: ["bookingLinkId"],
        where: liveLinkBookingWhere({ in: links.map((l) => l.id) }),
        _count: { _all: true },
      })
    : [];
  const bookedCount = new Map(
    counts.map((c) => [c.bookingLinkId, c._count._all]),
  );

  const nowMs = Date.now();
  const today = toLocalDateString(new Date(nowMs));

  return links.map((l) => {
    const reminder = parseReminder(l.reminderSettings);
    const schedule = parseSchedule(withSchedule ? l.schedule : null);
    const booked = bookedCount.get(l.id) ?? 0;
    return {
      id: l.id,
      slug: l.slug,
      name: l.name,
      description: l.description,
      shopId: l.shopId,
      shopName: l.shopId ? (shopName.get(l.shopId) ?? null) : null,
      isActive: l.isActive,
      requireStaffSelection: l.requireStaffSelection,
      allowOverflowAtBreak: l.allowOverflowAtBreak,
      allowOverflowAtClose: l.allowOverflowAtClose,
      intervalMin: l.intervalMin,
      allowedMenuIds: parseMenuIds(l.allowedMenuIds),
      reminderEnabled: reminder.enabled,
      reminderHoursBefore: reminder.hoursBefore,
      schedule,
      bookedCount: booked,
      state: scheduleState(schedule, { today, nowMs, bookedCount: booked }),
    };
  });
}
