"use server";

import { db } from "@/helper/lib/db";
import { jstDateTimeToDate, addMinutes } from "@/helper/utils/time";
import { checkStaffAvailability } from "@/feature/reservation/actions/reservationActions";
import { publicBookingSchema } from "@/feature/reservation/schema/reservationSchema";

export type PublicResult =
  | { ok: true }
  | { ok: false; error: string };

function parseMenuIds(raw: string | null): number[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(Number).filter(Number.isInteger) : [];
  } catch {
    return [];
  }
}

export async function submitPublicBooking(
  _prev: PublicResult | null,
  formData: FormData,
): Promise<PublicResult> {
  const raw = Object.fromEntries(formData.entries());
  for (const k of Object.keys(raw)) if (raw[k] === "") delete raw[k];

  const parsed = publicBookingSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "入力内容を確認してください",
    };
  }
  const input = parsed.data;

  const link = await db.bookingLink.findFirst({
    where: { slug: input.slug, isActive: true, deletedAt: null },
  });
  if (!link) {
    return { ok: false, error: "この予約リンクは現在利用できません" };
  }

  // Shop must belong to the brand and respect the link's shop constraint.
  const shop = await db.shop.findFirst({
    where: {
      id: input.shopId,
      brandId: link.brandId,
      deletedAt: null,
      ...(link.shopId ? { id: link.shopId } : {}),
    },
    select: { id: true },
  });
  if (!shop) {
    return { ok: false, error: "店舗の指定が正しくありません" };
  }

  const allowed = parseMenuIds(link.allowedMenuIds);
  const menu = await db.menu.findFirst({
    where: {
      id: input.menuId,
      deletedAt: null,
      isPublic: true,
      OR: [{ shopId: null }, { shopId: shop.id }],
      ...(allowed.length ? { id: { in: allowed } } : {}),
    },
    select: { id: true, durationMin: true, price: true },
  });
  if (!menu) {
    return { ok: false, error: "メニューの指定が正しくありません" };
  }

  const startAt = jstDateTimeToDate(input.date, input.startTime);
  const endAt = addMinutes(startAt, menu.durationMin);

  if (input.staffId) {
    const staff = await db.staff.findFirst({
      where: { id: input.staffId, shopId: shop.id, deletedAt: null },
      select: { id: true },
    });
    if (!staff) return { ok: false, error: "スタッフの指定が正しくありません" };

    const avail = await checkStaffAvailability({
      shopId: shop.id,
      staffId: input.staffId,
      startAt,
      endAt,
    });
    if (!avail.available) {
      return {
        ok: false,
        error: "指定の時間帯は予約が埋まっています。別の時間をお選びください",
      };
    }
  }

  await db.appointment.create({
    data: {
      shopId: shop.id,
      menuId: menu.id,
      staffId: input.staffId ?? null,
      bookingLinkId: link.id,
      startAt,
      endAt,
      status: 0,
      source: "public",
      guestName: input.guestName,
      guestPhone: input.guestPhone,
      note: input.note ?? null,
    },
  });

  return { ok: true };
}
