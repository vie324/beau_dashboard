"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/helper/lib/db";
import { jstDateTimeToDate, addMinutes } from "@/helper/utils/time";
import { resolveHoursForDate } from "@/helper/utils/shopHours";
import { staffWorksOn } from "@/helper/utils/staffWork";
import {
  activeMenuStaffIds,
  capableStaffIds,
  canStaffHandleMenu,
} from "@/helper/utils/menuStaff";
import {
  checkStaffAvailability,
  checkEquipmentAvailability,
} from "@/feature/reservation/actions/reservationActions";
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
      hoursByDow: true,
      dateOverrides: true,
    },
  });
  if (!shop) return { ok: false, error: "店舗の指定が正しくありません" };

  // リンクの許可メニューは where に混ぜない（`id` キーが上書きされ、選択した
  // メニューではなく許可リストの先頭が引かれてしまうため）。先に判定する。
  const allowed = parseMenuIds(link.allowedMenuIds);
  if (allowed.length && !allowed.includes(input.menuId)) {
    return { ok: false, error: "メニューの指定が正しくありません" };
  }
  const menu = await db.menu.findFirst({
    where: {
      id: input.menuId,
      deletedAt: null,
      isPublic: true,
      OR: [{ shopId: null }, { shopId: shop.id }],
    },
    select: {
      id: true,
      durationMin: true,
      requiresStaff: true,
      equipmentId: true,
      staffLinks: { select: { staffId: true } },
    },
  });
  if (!menu) return { ok: false, error: "メニューの指定が正しくありません" };

  const allStaff = await db.staff.findMany({
    where: { shopId: shop.id, deletedAt: null, isBookable: true },
    select: { id: true, spotMode: true, workDates: true },
  });
  // このメニューを担当できるスタッフだけを候補にする（設定「対応スタッフ」）。
  // 出勤状況ではなく在籍者全員から求めるので、その日の出勤者によって
  // 「制限なし」への切り替わり方が変わることはない。
  const capable = new Set(
    capableStaffIds(
      allStaff.map((s) => s.id),
      menu.staffLinks.map((l) => l.staffId),
    ),
  );
  // その日に出勤しているスタッフだけを候補にする（臨時スタッフは出勤日のみ）。
  const candidatesForDate = (dateStr: string): number[] => {
    let ids = allStaff
      .filter((s) => capable.has(s.id) && staffWorksOn(s, dateStr))
      .map((s) => s.id);
    if (link.requireStaffSelection && input.staffId) {
      ids = ids.filter((id) => id === input.staffId);
    }
    return ids;
  };

  // メニューが設備を要求するなら、その設備が予約可能でなければ枠なし。
  if (menu.equipmentId) {
    const eq = await db.equipment.findFirst({
      where: { id: menu.equipmentId, deletedAt: null, isBookable: true },
      select: { id: true },
    });
    if (!eq) {
      return { ok: true, times: [], days: [] };
    }
  }

  // Appointments across the 7-day window (blocking statuses only).
  // 時間ブロック (kind="block") はスタッフが確実に不在の意味なので、
  // 空き判定上は常に「埋まっている」扱い。
  const winStart = jstDateTimeToDate(input.weekStart, "00:00");
  const winEnd = new Date(winStart.getTime() + 7 * 24 * 60 * 60 * 1000);
  const appts = await db.appointment.findMany({
    where: {
      shopId: shop.id,
      deletedAt: null,
      status: { notIn: [3, 4, 99] },
      startAt: { gte: winStart, lt: winEnd },
    },
    select: {
      staffId: true,
      equipmentId: true,
      startAt: true,
      endAt: true,
    },
  });
  const apptMs = appts.map((a) => ({
    staffId: a.staffId,
    equipmentId: a.equipmentId,
    s: new Date(a.startAt).getTime(),
    e: new Date(a.endAt).getTime(),
  }));

  // 各日の営業時間を曜日オーバーライド込みで解決し、開始時刻の和集合を作る。
  const perDayHours = Array.from({ length: 7 }, (_, i) =>
    resolveHoursForDate(shop, shiftYmd(input.weekStart, i)),
  );

  const timesSet = new Set<number>();
  for (const h of perDayHours) {
    if (h.isClosed) continue;
    const o = hm(h.openTime) ?? 9 * 60;
    const c = hm(h.closeTime) ?? 21 * 60;
    for (let m = o; m <= c; m += interval) timesSet.add(m);
  }
  const sortedTimes = [...timesSet].sort((a, b) => a - b);
  const times: string[] = sortedTimes.map(
    (m) =>
      `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(
        2,
        "0",
      )}`,
  );

  const now = Date.now();
  const days: AvailabilityDay[] = [];

  for (let i = 0; i < 7; i++) {
    const date = shiftYmd(input.weekStart, i);
    const dh = perDayHours[i];
    const dayOpen = hm(dh.openTime) ?? 9 * 60;
    const dayClose = hm(dh.closeTime) ?? 21 * 60;
    const bStart = hm(dh.breakStart);
    const bEnd = hm(dh.breakEnd);
    const candidates = candidatesForDate(date);
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
      // 休業日は全枠 NG。営業日は曜日別の open〜close 範囲外も NG。
      if (ok && dh.isClosed) ok = false;
      if (ok && (tMin < dayOpen || tMin > dayClose)) ok = false;
      // 休憩開始の内側スタートは常に NG（境界はOK）。
      // 休憩をまたぐ予約 (start < bStart < slotEnd) は allowOverflowAtBreak で制御。
      if (ok && bStart != null && bEnd != null) {
        if (tMin > bStart && tMin < bEnd) ok = false;
        if (
          ok &&
          !link.allowOverflowAtBreak &&
          tMin < bStart &&
          slotEnd > slotStart + (bStart - tMin) * 60000
        ) {
          ok = false;
        }
      }
      // 閉店をまたぐ予約 (slotEnd > dayClose) は allowOverflowAtClose で制御。
      if (
        ok &&
        !link.allowOverflowAtClose &&
        slotEnd > slotStart + (dayClose - tMin) * 60000
      ) {
        ok = false;
      }
      // スタッフ重複: menu.requiresStaff のときだけチェック。
      if (ok && menu.requiresStaff) {
        if (candidates.length) {
          ok = candidates.some(
            (sid) =>
              !apptMs.some(
                (a) =>
                  a.staffId === sid && a.s < slotEnd && a.e > slotStart,
              ),
          );
        } else {
          // スタッフ必須なのに候補が居ない → 予約不可
          ok = false;
        }
      }
      // 設備重複: メニューが設備を指定しているならその設備の空きをチェック。
      if (ok && menu.equipmentId) {
        ok = !apptMs.some(
          (a) =>
            a.equipmentId === menu.equipmentId &&
            a.s < slotEnd &&
            a.e > slotStart,
        );
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
    select: {
      id: true,
      openTime: true,
      closeTime: true,
      breakStart: true,
      breakEnd: true,
      hoursByDow: true,
      dateOverrides: true,
    },
  });
  if (!shop) {
    return { ok: false, error: "店舗の指定が正しくありません" };
  }

  // 許可メニューの判定は where に混ぜない（`id` キーが上書きされ、送信された
  // メニューではなく許可リストの先頭で予約が作られてしまうため）。
  const allowed = parseMenuIds(link.allowedMenuIds);
  if (allowed.length && !allowed.includes(input.menuId)) {
    return { ok: false, error: "メニューの指定が正しくありません" };
  }
  const menu = await db.menu.findFirst({
    where: {
      id: input.menuId,
      deletedAt: null,
      isPublic: true,
      OR: [{ shopId: null }, { shopId: shop.id }],
    },
    select: {
      id: true,
      durationMin: true,
      price: true,
      requiresStaff: true,
      equipmentId: true,
      staffLinks: { select: { staffId: true } },
    },
  });
  if (!menu) {
    return { ok: false, error: "メニューの指定が正しくありません" };
  }
  const menuStaffIds = menu.staffLinks.map((l) => l.staffId);

  const startAt = jstDateTimeToDate(input.date, input.startTime);
  const endAt = addMinutes(startAt, menu.durationMin);

  // リンクの最終受付設定をサーバ側でも検証（カレンダーをすり抜けた POST 対策）。
  const dh = resolveHoursForDate(shop, input.date);
  if (dh.isClosed) {
    return { ok: false, error: "休業日のため予約できません" };
  }
  const startMin = hm(input.startTime) ?? -1;
  const openMin = hm(dh.openTime) ?? 0;
  const closeMin = hm(dh.closeTime) ?? 24 * 60;
  const bStartMin = hm(dh.breakStart);
  const bEndMin = hm(dh.breakEnd);
  if (startMin < openMin || startMin > closeMin) {
    return { ok: false, error: "営業時間外のため予約できません" };
  }
  if (bStartMin != null && bEndMin != null) {
    if (startMin > bStartMin && startMin < bEndMin) {
      return { ok: false, error: "休憩時間のため予約できません" };
    }
    if (
      !link.allowOverflowAtBreak &&
      startMin < bStartMin &&
      startMin + menu.durationMin > bStartMin
    ) {
      return { ok: false, error: "休憩をまたぐ予約はこのリンクでは不可です" };
    }
  }
  if (
    !link.allowOverflowAtClose &&
    startMin + menu.durationMin > closeMin
  ) {
    return {
      ok: false,
      error: "営業終了をまたぐ予約はこのリンクでは不可です",
    };
  }

  let assignedStaffId: number | null = null;

  if (menu.requiresStaff) {
    // 「対応スタッフ」の判定に使う、この店舗の予約可能スタッフ一覧。
    // 指名予約・自動割当のどちらでも同じ基準で絞り込む。
    const shopStaffs = await db.staff.findMany({
      where: { shopId: shop.id, deletedAt: null, isBookable: true },
      orderBy: [{ allocateOrder: "asc" }, { id: "asc" }],
      select: { id: true, spotMode: true, workDates: true },
    });
    const shopStaffIds = shopStaffs.map((s) => s.id);

    if (input.staffId) {
      const staff = await db.staff.findFirst({
        where: { id: input.staffId, shopId: shop.id, deletedAt: null },
        select: { id: true, spotMode: true, workDates: true },
      });
      if (!staff)
        return { ok: false, error: "スタッフの指定が正しくありません" };
      if (!staffWorksOn(staff, input.date)) {
        return {
          ok: false,
          error: "選択したスタッフはこの日は予約を受け付けていません",
        };
      }
      if (!canStaffHandleMenu(staff.id, shopStaffIds, menuStaffIds)) {
        return {
          ok: false,
          error: "選択したスタッフはこのメニューを担当できません",
        };
      }

      const avail = await checkStaffAvailability({
        shopId: shop.id,
        staffId: input.staffId,
        startAt,
        endAt,
      });
      if (!avail.available) {
        return {
          ok: false,
          error:
            "指定の時間帯は予約が埋まっています。別の時間をお選びください",
        };
      }
      assignedStaffId = input.staffId;
    } else {
      // 指名なし: 設定の割当優先順（allocateOrder 昇順）で空きスタッフへ自動割当。
      // メニューの「対応スタッフ」以外には割り当てない。臨時スタッフは出勤日のみ対象。
      const capable = new Set(capableStaffIds(shopStaffIds, menuStaffIds));
      const staffs = shopStaffs.filter(
        (s) => capable.has(s.id) && staffWorksOn(s, input.date),
      );
      if (staffs.length) {
        for (const s of staffs) {
          const a = await checkStaffAvailability({
            shopId: shop.id,
            staffId: s.id,
            startAt,
            endAt,
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
      } else if (activeMenuStaffIds(shopStaffIds, menuStaffIds).length) {
        // 対応スタッフを設定しているメニューは、その人が出勤していない日に
        // 「指名なし」で通してしまうと現場が困る（空き表でも × になっている）。
        return {
          ok: false,
          error:
            "このメニューを担当できるスタッフの空きがありません。別の日時をお選びください",
        };
      }
    }
  }

  // 設備のチェック: メニューが設備を指定していれば空きを確認。
  if (menu.equipmentId) {
    const equip = await db.equipment.findFirst({
      where: { id: menu.equipmentId, deletedAt: null, isBookable: true },
      select: { id: true },
    });
    if (!equip) {
      return {
        ok: false,
        error: "この設備は現在予約できません",
      };
    }
    const avail = await checkEquipmentAvailability({
      shopId: shop.id,
      equipmentId: menu.equipmentId,
      startAt,
      endAt,
      
    });
    if (!avail.available) {
      return {
        ok: false,
        error: "指定の時間帯は設備が埋まっています。別の時間をお選びください",
      };
    }
  }

  try {
    await db.appointment.create({
      data: {
        shopId: shop.id,
        menuId: menu.id,
        staffId: assignedStaffId,
        equipmentId: menu.equipmentId ?? null,
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
