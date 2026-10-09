"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/helper/lib/db";
import {
  jstDateTimeToDate,
  addMinutes,
  toLocalDateString,
} from "@/helper/utils/time";
import { resolveHoursForDate } from "@/helper/utils/shopHours";
import { staffWorksOn } from "@/helper/utils/staffWork";
import { FREEING_STATUSES } from "@/helper/utils/status";
import {
  capableStaffIds,
  canStaffHandleMenu,
} from "@/helper/utils/menuStaff";
import { publicBookingSchema } from "@/feature/reservation/schema/reservationSchema";
import { notifyAppointment } from "@/feature/notification/lib/notify";
import {
  countLinkBookings,
  findPublicLink,
  getLinkStatus,
  isResourceBusy,
  liveLinkBookingWhere,
  lockPublicBooking,
} from "@/feature/booking-link/lib/linkDb";
import {
  dateWindowRange,
  isBeforeDeadline,
  isScheduleSlot,
  leadTimeLabel,
  openSlots,
  scheduleDatePage,
  withinTimeWindow,
} from "@/feature/booking-link/lib/schedule";

export type PublicResult =
  | { ok: true }
  | { ok: false; error: string };

export type AvailabilityDay = {
  date: string;
  label: string;
  dow: string;
  weekend: 0 | 6 | null;
  /** 開始時刻 → 予約できるか。枠限定（layout=slots）ではキー = その日に出す枠 */
  avail: Record<string, boolean>;
  /** 1枠の受付数に上限があるときの残り件数（開始時刻 → 件数） */
  remaining?: Record<string, number>;
};

export type AvailabilityResult =
  | {
      ok: true;
      /** grid = 週間の ◎/× 表、slots = 日付ごとの枠ボタン（枠限定） */
      layout: "grid" | "slots";
      times: string[];
      days: AvailabilityDay[];
      /** 前の画面 / 次の画面の先頭日（無ければ null） */
      prevCursor: string | null;
      nextCursor: string | null;
      /** 1枠あたりの受付数の上限（無ければ null） */
      slotCapacity: number | null;
    }
  | { ok: false; error: string };

const DAY_MS = 24 * 60 * 60 * 1000;

function hm(t?: string | null): number | null {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  if (!Number.isInteger(h) || !Number.isInteger(m)) return null;
  return h * 60 + m;
}

function hmString(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/**
 * ◎/× availability for the public booking calendar.
 * 1画面 = 受付する日（最大7日）。通常は今日から7日ずつ、日付限定・枠限定・曜日指定は
 * 受付する日だけを並べる。cursor はその画面の先頭日。
 */
export async function getPublicAvailability(input: {
  slug: string;
  shopId: number;
  menuId: number;
  staffId?: number | null;
  /** 表示する画面の先頭日（"YYYY-MM-DD"）。未指定・過去なら今日 */
  cursor?: string | null;
}): Promise<AvailabilityResult> {
  const link = await findPublicLink(input.slug);
  if (!link) return { ok: false, error: "この予約リンクは現在利用できません" };

  const schedule = link.schedule;
  const nowMs = Date.now();
  const status = await getLinkStatus(link, nowMs);
  if (status.state !== "open") return { ok: false, error: status.message };

  const interval = [15, 30, 60].includes(link.intervalMin)
    ? link.intervalMin
    : 30;
  const layout: "grid" | "slots" = schedule.mode === "slots" ? "slots" : "grid";

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

  // 「対応スタッフ」の制限は在籍スタッフ全員（予約受付の対象外も含む）を基準に判定する。
  // 予約可能なスタッフだけで判定すると、対象外の人だけに限定したメニューが
  // 「制限なし」扱いになり、全員に枠が出てしまうため。候補は予約可能な人だけ。
  const shopStaffAll = await db.staff.findMany({
    where: { shopId: shop.id, deletedAt: null },
    select: { id: true, spotMode: true, workDates: true, isBookable: true },
  });
  const allStaff = shopStaffAll.filter((s) => s.isBookable);
  // 出勤状況ではなく在籍者全員から求めるので、その日の出勤者によって
  // 「制限なし」への切り替わり方が変わることはない。
  const capable = new Set(
    capableStaffIds(
      shopStaffAll.map((s) => s.id),
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

  const today = toLocalDateString(new Date(nowMs));
  const page = scheduleDatePage(schedule, input.cursor, { today, nowMs });
  const empty = {
    ok: true as const,
    layout,
    times: [],
    days: [],
    prevCursor: page.prevCursor,
    nextCursor: page.nextCursor,
    slotCapacity: schedule.slotCapacity,
  };

  // メニューが設備を要求するなら、その設備が予約可能でなければ枠なし。
  if (menu.equipmentId) {
    const eq = await db.equipment.findFirst({
      where: { id: menu.equipmentId, deletedAt: null, isBookable: true },
      select: { id: true },
    });
    if (!eq) return { ...empty, prevCursor: null, nextCursor: null };
  }
  if (page.dates.length === 0) return empty;

  // 画面に出す日の予約（キャンセル等は除く）。日付限定などで日が飛び飛びでも、
  // その日の分だけを読む。時間ブロック (kind="block") はスタッフが確実に
  // 不在の意味なので、空き判定上は常に「埋まっている」扱い。
  const dayRanges = page.dates.map((d) => {
    const gte = jstDateTimeToDate(d, "00:00");
    return { startAt: { gte, lt: new Date(gte.getTime() + DAY_MS) } };
  });
  const appts = await db.appointment.findMany({
    where: {
      shopId: shop.id,
      deletedAt: null,
      status: { notIn: FREEING_STATUSES },
      OR: dayRanges,
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

  // 1枠あたりの受付数に上限があるときは、このリンク経由の予約を開始時刻ごとに数える
  // （店舗を選べるリンクは全店舗の合計）。
  const linkCount = new Map<number, number>();
  if (schedule.slotCapacity != null) {
    const rows = await db.appointment.findMany({
      where: { ...liveLinkBookingWhere(link.id), OR: dayRanges },
      select: { startAt: true },
    });
    for (const r of rows) {
      const k = new Date(r.startAt).getTime();
      linkCount.set(k, (linkCount.get(k) ?? 0) + 1);
    }
  }

  // 枠限定: 登録した枠（締切前のもの）をそのまま出す。営業時間は見ない。
  // 時間帯つきの日付限定: その日の時間帯を時間間隔で刻む。営業時間・休憩・休業日は見ない。
  // それ以外: 各日の営業時間（曜日・日付のオーバーライド込み）を時間間隔で刻み、
  // 時間帯の指定があればその範囲だけにする。行は画面内の日の和集合。
  const perDayHours = page.dates.map((d) => resolveHoursForDate(shop, d));
  const ownRanges = perDayHours.map((h) => dateWindowRange(schedule, h));
  const slotTimesByDate = new Map<string, string[]>();
  for (const x of openSlots(schedule, nowMs)) {
    const list = slotTimesByDate.get(x.date);
    if (list) list.push(x.time);
    else slotTimesByDate.set(x.date, [x.time]);
  }
  const windowFrom = hm(schedule.timeFrom);
  const windowTo = hm(schedule.timeTo);
  const timesSet = new Set<number>();
  if (layout === "slots") {
    for (const d of page.dates) {
      for (const t of slotTimesByDate.get(d) ?? []) timesSet.add(hm(t)!);
    }
  } else {
    perDayHours.forEach((h, i) => {
      const own = ownRanges[i];
      if (own) {
        for (let m = own.from; m <= own.to; m += interval) timesSet.add(m);
        return;
      }
      if (h.isClosed) return;
      const o = hm(h.openTime) ?? 9 * 60;
      const c = hm(h.closeTime) ?? 21 * 60;
      const from = windowFrom != null && windowFrom > o ? windowFrom : o;
      const to = windowTo != null && windowTo < c ? windowTo : c;
      for (let m = from; m <= to; m += interval) timesSet.add(m);
    });
  }
  const times = [...timesSet].sort((a, b) => a - b).map(hmString);

  const days: AvailabilityDay[] = page.dates.map((date, i) => {
    const dh = perDayHours[i];
    const own = ownRanges[i];
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
    const offered = layout === "slots" ? (slotTimesByDate.get(date) ?? []) : times;
    const avail: Record<string, boolean> = {};
    const remaining: Record<string, number> = {};
    for (const t of offered) {
      const tMin = hm(t)!;
      const slotStart = jstDateTimeToDate(date, t).getTime();
      const slotEnd = slotStart + menu.durationMin * 60000;
      // 過去・受付締切を過ぎた枠は NG。
      let ok = isBeforeDeadline(schedule, slotStart, nowMs);
      if (own) {
        // 時間帯つきの日付限定: その日の受付範囲（行は画面内の日の和集合なので日ごとに見る）。
        if (ok && (tMin < own.from || tMin > own.to)) ok = false;
      } else if (layout === "grid") {
        // 休業日は全枠 NG。営業日は曜日別の open〜close 範囲外も NG。
        if (ok && dh.isClosed) ok = false;
        if (ok && (tMin < dayOpen || tMin > dayClose)) ok = false;
        if (ok && !withinTimeWindow(schedule, t)) ok = false;
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
      }
      const overlaps = (a: { s: number; e: number }) =>
        a.s < slotEnd && a.e > slotStart;
      // スタッフ重複: menu.requiresStaff のときだけチェック。空いている人数も数える。
      let freeResources = Number.POSITIVE_INFINITY;
      if (ok && menu.requiresStaff) {
        // スタッフ必須なのに候補が居ない → 予約不可
        freeResources = candidates.filter(
          (sid) => !apptMs.some((a) => a.staffId === sid && overlaps(a)),
        ).length;
        if (freeResources === 0) ok = false;
      }
      // 設備重複: メニューが設備を指定しているならその設備の空きをチェック。
      if (ok && menu.equipmentId) {
        if (apptMs.some((a) => a.equipmentId === menu.equipmentId && overlaps(a))) {
          ok = false;
        }
        freeResources = Math.min(freeResources, 1);
      }
      // 1枠あたりの受付数（このリンク経由の予約で数える）
      if (schedule.slotCapacity != null) {
        const left = Math.max(
          0,
          schedule.slotCapacity - (linkCount.get(slotStart) ?? 0),
        );
        if (left === 0) ok = false;
        remaining[t] = ok ? Math.min(left, freeResources) : 0;
      }
      avail[t] = ok;
    }
    return {
      date,
      label: `${mm}/${dd}`,
      dow,
      weekend: dowNum === 0 ? 0 : dowNum === 6 ? 6 : null,
      avail,
      ...(schedule.slotCapacity != null ? { remaining } : {}),
    };
  });

  return {
    ok: true,
    layout,
    times,
    days,
    prevCursor: page.prevCursor,
    nextCursor: page.nextCursor,
    slotCapacity: schedule.slotCapacity,
  };
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

/** トランザクション内で予約を受け付けられないと分かったとき（ロールバックしてこの文言を返す）。 */
class BookingRejected extends Error {}

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

  const link = await findPublicLink(input.slug);
  if (!link) {
    return { ok: false, error: "この予約リンクは現在利用できません" };
  }
  const schedule = link.schedule;
  const nowMs = Date.now();

  // 受付期間・先着の定員（ここは早めに断るための確認。定員の最終判定は登録時のロック内）
  const status = await getLinkStatus(link, nowMs);
  if (status.state !== "open") return { ok: false, error: status.message };

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

  // リンクの受付日時（日付限定・期間限定・枠限定・時間帯）と受付締切をサーバ側でも検証
  // （カレンダーをすり抜けた POST 対策。過去の日時もここで弾く）。
  if (!isScheduleSlot(schedule, input.date, input.startTime)) {
    return {
      ok: false,
      error: "この日時はこのリンクでは予約を受け付けていません",
    };
  }
  if (!isBeforeDeadline(schedule, startAt.getTime(), nowMs)) {
    return {
      ok: false,
      error:
        schedule.leadMinutes > 0
          ? `受付締切（${leadTimeLabel(schedule.leadMinutes)}）を過ぎているため予約できません`
          : "この時間はすでに受付を終了しています。別の時間をお選びください",
    };
  }

  // リンクの最終受付設定をサーバ側でも検証（カレンダーをすり抜けた POST 対策）。
  // 枠限定・時間帯つきの日付限定は「指定した日時をそのまま受け付ける」設定なので、
  // 営業時間・休憩は見ない（時間帯つきの日付限定は、その日の受付範囲だけ確認する）。
  const dayHours =
    schedule.mode === "slots" ? null : resolveHoursForDate(shop, input.date);
  const ownRange = dayHours && dateWindowRange(schedule, dayHours);
  if (ownRange) {
    const startMin = hm(input.startTime) ?? -1;
    if (startMin < ownRange.from || startMin > ownRange.to) {
      return {
        ok: false,
        error: "この日時はこのリンクでは予約を受け付けていません",
      };
    }
  } else if (dayHours) {
    const dh = dayHours;
    if (dh.isClosed) {
      return { ok: false, error: "休業日のため予約できません" };
    }
    const startMin = hm(input.startTime) ?? -1;
    // 未設定時の既定（9:00〜21:00）は空き表と合わせる。
    const openMin = hm(dh.openTime) ?? 9 * 60;
    const closeMin = hm(dh.closeTime) ?? 21 * 60;
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
  }

  // スタッフの事前確認（出勤日・担当可否は他の予約に左右されないので、ロックの外で行う）。
  // 空き時間の判定と割当は、登録と同じトランザクションのロック内で行う。
  let autoStaffIds: number[] = [];
  if (menu.requiresStaff) {
    // 「対応スタッフ」の判定に使う、この店舗の予約可能スタッフ一覧。
    // 指名予約・自動割当のどちらでも同じ基準で絞り込む。
    // 制限の判定は在籍スタッフ全員、割当の候補は予約可能な人だけ（空き表と同じ基準）。
    const shopStaffAll = await db.staff.findMany({
      where: { shopId: shop.id, deletedAt: null },
      orderBy: [{ allocateOrder: "asc" }, { id: "asc" }],
      select: { id: true, spotMode: true, workDates: true, isBookable: true },
    });
    const shopStaffs = shopStaffAll.filter((s) => s.isBookable);
    const shopStaffIds = shopStaffAll.map((s) => s.id);

    // 「スタッフ指名を必須にする」リンクは指名なしで受け付けない。
    if (link.requireStaffSelection && !input.staffId) {
      return { ok: false, error: "ご希望のスタッフを選んでください" };
    }

    if (input.staffId) {
      const staff = await db.staff.findFirst({
        // 予約受付の対象外（isBookable=false）のスタッフは公開ページから指名できない
        where: {
          id: input.staffId,
          shopId: shop.id,
          deletedAt: null,
          isBookable: true,
        },
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
    } else {
      // 指名なし: 設定の割当優先順（allocateOrder 昇順）で空きスタッフへ自動割当。
      // メニューの「対応スタッフ」以外には割り当てない。臨時スタッフは出勤日のみ対象。
      const capable = new Set(capableStaffIds(shopStaffIds, menuStaffIds));
      autoStaffIds = shopStaffs
        .filter((s) => capable.has(s.id) && staffWorksOn(s, input.date))
        .map((s) => s.id);
      // 担当できるスタッフがその日に1人もいなければ受け付けない（空き表でも × になっている）。
      // 対応スタッフを設定しているメニューで、その人が出勤していない日も同じ。
      if (autoStaffIds.length === 0) {
        return {
          ok: false,
          error:
            "このメニューを担当できるスタッフの空きがありません。別の日時をお選びください",
        };
      }
    }
  }

  // 設備のチェック: メニューが設備を指定していれば予約可能な設備か確認。
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
  }

  // 空き・定員の確認から登録までを1トランザクションで行い、同じリンク・同じ店舗の
  // 公開予約とはロックで直列化する（「2枠限定」に同時に申し込まれても超えない）。
  let created: { id: number };
  try {
    created = await db.$transaction(
      async (tx) => {
        await lockPublicBooking(tx, link.id, shop.id);

        if (
          schedule.maxBookings != null &&
          (await countLinkBookings(tx, link.id)) >= schedule.maxBookings
        ) {
          throw new BookingRejected("定員に達したため、受付を終了しました");
        }
        if (
          schedule.slotCapacity != null &&
          (await countLinkBookings(tx, link.id, startAt)) >=
            schedule.slotCapacity
        ) {
          throw new BookingRejected(
            "この枠は満席になりました。別の日時をお選びください",
          );
        }

        let assignedStaffId: number | null = null;
        if (menu.requiresStaff) {
          if (input.staffId) {
            if (
              await isResourceBusy(tx, {
                shopId: shop.id,
                staffId: input.staffId,
                startAt,
                endAt,
              })
            ) {
              throw new BookingRejected(
                "指定の時間帯は予約が埋まっています。別の時間をお選びください",
              );
            }
            assignedStaffId = input.staffId;
          } else if (autoStaffIds.length) {
            for (const staffId of autoStaffIds) {
              const busy = await isResourceBusy(tx, {
                shopId: shop.id,
                staffId,
                startAt,
                endAt,
              });
              if (!busy) {
                assignedStaffId = staffId;
                break;
              }
            }
            if (assignedStaffId == null) {
              throw new BookingRejected(
                "ご指定の時間は満席です。別の時間をお選びください",
              );
            }
          }
        }

        // 設備のチェック: メニューが設備を指定していれば空きを確認。
        if (
          menu.equipmentId &&
          (await isResourceBusy(tx, {
            shopId: shop.id,
            equipmentId: menu.equipmentId,
            startAt,
            endAt,
          }))
        ) {
          throw new BookingRejected(
            "指定の時間帯は設備が埋まっています。別の時間をお選びください",
          );
        }

        return tx.appointment.create({
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
          select: { id: true },
        });
      },
      { maxWait: 5000, timeout: 10000 },
    );
  } catch (e) {
    if (e instanceof BookingRejected) return { ok: false, error: e.message };
    return {
      ok: false,
      error: "予約の送信に失敗しました。時間をおいて再度お試しください",
    };
  }

  // 店舗への通知（ベル＋メール）。notifyAppointment は例外を投げないので、
  // 通知が失敗してもお客様の予約は成立したままにする。
  await notifyAppointment({ appointmentId: created.id, kind: "reservation" });

  revalidatePath("/reservation");
  return { ok: true };
}
