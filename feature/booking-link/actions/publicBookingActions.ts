"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/helper/lib/db";
import { jstDateTimeToDate, addMinutes } from "@/helper/utils/time";
import { checkStaffAvailability } from "@/feature/reservation/actions/reservationActions";
import { publicBookingSchema } from "@/feature/reservation/schema/reservationSchema";

export type PublicResult =
  | { ok: true }
  | { ok: false; error: string };

export type AvailabilityDay = {
  date: string;
  label: string;
  dow: string;
  weekend: 0 | 6 | null;
  avail: Record<string, boolean>;
};

export type AvailabilityResult =
  | { ok: true; times: string[]; days: AvailabilityDay[] }
  | { ok: false; error: string };

function hm(t?: string | null): number | null {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  if (!Number.isInteger(h) || !Number.isInteger(m)) return null;
  return h * 60 + m;
}

function shiftYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  base.setUTCDate(base.getUTCDate() + days);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(base);
}

/** ◎/× weekly availability for the public booking calendar. */
export async function getPublicAvailability(input: {
  slug: string;
  shopId: number;
  menuId: number;
  interval: number; // 15 | 30 | 60
  weekStart: string; // YYYY-MM-DD (day 0 of the 7-day view)
  staffId?: number | null;
}): Promise<AvailabilityResult> {
  const interval = [15, 30, 60].includes(input.interval)
    ? input.interval
    : 30;

  const link = await db.bookingLink.findFirst({
    where: { slug: input.slug, isActive: true, deletedAt: null },
  });
  if (!link) return { ok: false, error: "この予約リンクは現在利用できません" };

  const shop = await db.shop.findFirst({
    where: {
      id: input.shopId,
      brandId: link.brandId,
      deletedAt: null,
      ...(link.shopId ? { id: link.shopId } : {}),
    },
    select: {
      id: true,
      openTime: true,
      closeTime: true,
      breakStart: true,
      breakEnd: true,
    },
  });
  if (!shop) return { ok: false, error: "店舗の指定が正しくありません" };

  const allowed = parseMenuIds(link.allowedMenuIds);
  const menu = await db.menu.findFirst({
    where: {
      id: input.menuId,
      deletedAt: null,
      isPublic: true,
      OR: [{ shopId: null }, { shopId: shop.id }],
      ...(allowed.length ? { id: { in: allowed } } : {}),
    },
    select: { id: true, durationMin: true },
  });
  if (!menu) return { ok: false, error: "メニューの指定が正しくありません" };

  const openMin = hm(shop.openTime) ?? 9 * 60;
  const closeMin = hm(shop.closeTime) ?? 21 * 60;
  const bStart = hm(shop.breakStart);
  const bEnd = hm(shop.breakEnd);

  const allStaff = await db.staff.findMany({
    where: { shopId: shop.id, deletedAt: null, isBookable: true },
    select: { id: true },
  });
  let candidates = allStaff.map((s) => s.id);
  if (link.requireStaffSelection && input.staffId) {
    candidates = candidates.filter((id) => id === input.staffId);
  }

  // Appointments across the 7-day window (blocking statuses only).
  // 最終受付モード: kind="block"（スタッフの昼休み等）はスタッフ重複チェックから除外する。
  const winStart = jstDateTimeToDate(input.weekStart, "00:00");
  const winEnd = new Date(winStart.getTime() + 7 * 24 * 60 * 60 * 1000);
  const appts = await db.appointment.findMany({
    where: {
      shopId: shop.id,
      deletedAt: null,
      status: { notIn: [3, 4, 99] },
      startAt: { gte: winStart, lt: winEnd },
      ...(link.lastReceptionMode ? { kind: { not: "block" } } : {}),
    },
    select: { staffId: true, startAt: true, endAt: true },
  });
  const apptMs = appts.map((a) => ({
    staffId: a.staffId,
    s: new Date(a.startAt).getTime(),
    e: new Date(a.endAt).getTime(),
  }));

  const now = Date.now();
  const times: string[] = [];
  // 開始時刻は閉店時刻まで許可（メニュー所要時間で終了が閉店を越えても可：サロン側で延長対応）
  for (let m = openMin; m <= closeMin; m += interval) {
    times.push(
      `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(
        m % 60,
      ).padStart(2, "0")}`,
    );
  }

  const days: AvailabilityDay[] = [];

  for (let i = 0; i < 7; i++) {
    const date = shiftYmd(input.weekStart, i);
    const [yy, mm, dd] = date.split("-").map(Number);
    const noon = new Date(Date.UTC(yy, mm - 1, dd, 3, 0, 0));
    const dow = new Intl.DateTimeFormat("ja-JP", {
      timeZone: "Asia/Tokyo",
      weekday: "short",
    }).format(noon);
    const dowNum = new Date(Date.UTC(yy, mm - 1, dd)).getUTCDay();
    const avail: Record<string, boolean> = {};
    for (const t of times) {
      const tMin = hm(t)!;
      const slotStart = jstDateTimeToDate(date, t).getTime();
      const slotEnd = slotStart + menu.durationMin * 60000;
      let ok = slotStart >= now;
      // 休憩は「開始が休憩の内側」のときのみ不可。境界（開始＝休憩開始 or 休憩終了）と
      // 終了側のはみ出しは許可。
      if (ok && bStart != null && bEnd != null) {
        if (tMin > bStart && tMin < bEnd) ok = false;
      }
      if (ok) {
        if (candidates.length) {
          ok = candidates.some(
            (sid) =>
              !apptMs.some(
                (a) =>
                  a.staffId === sid && a.s < slotEnd && a.e > slotStart,
              ),
          );
        } else {
          ok = !apptMs.some((a) => a.s < slotEnd && a.e > slotStart);
        }
      }
      avail[t] = ok;
    }
    days.push({
      date,
      label: `${mm}/${dd}`,
      dow,
      weekend: dowNum === 0 ? 0 : dowNum === 6 ? 6 : null,
      avail,
    });
  }

  return { ok: true, times, days };
}

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

  let assignedStaffId: number | null = input.staffId ?? null;

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
      ignoreBlocks: link.lastReceptionMode,
    });
    if (!avail.available) {
      return {
        ok: false,
        error: "指定の時間帯は予約が埋まっています。別の時間をお選びください",
      };
    }
  } else {
    // 指名なし: 設定の割当優先順（allocateOrder 昇順）で空きスタッフへ自動割当。
    const staffs = await db.staff.findMany({
      where: { shopId: shop.id, deletedAt: null, isBookable: true },
      orderBy: [{ allocateOrder: "asc" }, { id: "asc" }],
      select: { id: true },
    });
    if (staffs.length) {
      for (const s of staffs) {
        const a = await checkStaffAvailability({
          shopId: shop.id,
          staffId: s.id,
          startAt,
          endAt,
          ignoreBlocks: link.lastReceptionMode,
        });
        if (a.available) {
          assignedStaffId = s.id;
          break;
        }
      }
      if (assignedStaffId == null) {
        return {
          ok: false,
          error: "ご指定の時間は満席です。別の時間をお選びください",
        };
      }
    }
  }

  try {
    await db.appointment.create({
      data: {
        shopId: shop.id,
        menuId: menu.id,
        staffId: assignedStaffId,
        bookingLinkId: link.id,
        startAt,
        endAt,
        status: 0,
        source: "public",
        confirmed: false,
        guestName: input.guestName,
        guestPhone: input.guestPhone,
        note: input.note ?? null,
      },
    });
  } catch {
    return {
      ok: false,
      error: "予約の送信に失敗しました。時間をおいて再度お試しください",
    };
  }

  revalidatePath("/reservation");
  return { ok: true };
}
