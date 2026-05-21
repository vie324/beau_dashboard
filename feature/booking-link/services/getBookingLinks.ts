import { db } from "@/helper/lib/db";

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
  const links = await db.bookingLink.findMany({
    where: { brandId, deletedAt: null },
    orderBy: { id: "asc" },
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

  return links.map((l) => {
    const reminder = parseReminder(l.reminderSettings);
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
    };
  });
}
