import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/helper/lib/db";
import { getBookingScheduleSupport } from "@/helper/lib/schemaSupport";
import { FREEING_STATUSES } from "@/helper/utils/status";
import { toLocalDateString } from "@/helper/utils/time";
import {
  formatLongDateTime,
  parseSchedule,
  scheduleState,
  type LinkSchedule,
  type ScheduleState,
} from "@/feature/booking-link/lib/schedule";

/**
 * BookingLink の schedule 以外の列。schedule は DDL 未適用の本番で P2022 に
 * ならないよう、getBookingScheduleSupport() が true のときだけ読む。
 * （select を付けない findFirst / update は全列を読みに行くので使わないこと）
 */
export const BOOKING_LINK_COLUMNS = {
  id: true,
  brandId: true,
  shopId: true,
  slug: true,
  name: true,
  description: true,
  isActive: true,
  requireStaffSelection: true,
  allowOverflowAtBreak: true,
  allowOverflowAtClose: true,
  intervalMin: true,
  allowedMenuIds: true,
  reminderSettings: true,
} as const;

export type LoadedLink = Prisma.BookingLinkGetPayload<{
  select: typeof BOOKING_LINK_COLUMNS;
}> & { schedule: LinkSchedule };

/** 公開中（有効・未削除）のリンクを受付日時の設定込みで読む。 */
export async function findPublicLink(slug: string): Promise<LoadedLink | null> {
  const withSchedule = await getBookingScheduleSupport();
  const link = await db.bookingLink.findFirst({
    where: { slug, isActive: true, deletedAt: null },
    select: { ...BOOKING_LINK_COLUMNS, schedule: withSchedule },
  });
  if (!link) return null;
  return {
    ...link,
    schedule: parseSchedule(withSchedule ? link.schedule : null),
  };
}

type Client = Prisma.TransactionClient;

/** リンク経由の「生きている」予約（キャンセル・当日キャンセル・no-show・削除を除く）。 */
export function liveLinkBookingWhere(
  linkId: number | { in: number[] },
): Prisma.AppointmentWhereInput {
  return {
    bookingLinkId: linkId,
    deletedAt: null,
    kind: "appointment",
    status: { notIn: FREEING_STATUSES },
  };
}

/** このリンク経由の予約件数。startAt を渡すとその枠（開始時刻）だけを数える。 */
export function countLinkBookings(
  client: Client,
  linkId: number,
  startAt?: Date,
): Promise<number> {
  return client.appointment.count({
    where: { ...liveLinkBookingWhere(linkId), ...(startAt ? { startAt } : {}) },
  });
}

/**
 * スタッフ / 設備がその時間帯に埋まっているか。
 * reservationActions の checkStaffAvailability / checkEquipmentAvailability と同じ判定を、
 * トランザクション内（tx）でも実行できるようにしたもの。
 */
export async function isResourceBusy(
  client: Client,
  params: {
    shopId: number;
    startAt: Date;
    endAt: Date;
  } & ({ staffId: number } | { equipmentId: number }),
): Promise<boolean> {
  const hit = await client.appointment.findFirst({
    where: {
      shopId: params.shopId,
      ...("staffId" in params
        ? { staffId: params.staffId }
        : { equipmentId: params.equipmentId }),
      deletedAt: null,
      status: { notIn: FREEING_STATUSES },
      startAt: { lt: params.endAt },
      endAt: { gt: params.startAt },
    },
    select: { id: true },
  });
  return hit != null;
}

// pg_advisory_xact_lock の名前空間（他の用途とキーがぶつからないように分ける）
const LOCK_NS_LINK = 7101;
const LOCK_NS_SHOP = 7102;

/**
 * 公開予約の「空き・定員を確認してから登録する」までを直列化するロック。
 * トランザクションの終了で自動的に解放される（transaction pooler 経由でも安全）。
 * 同じリンクの定員（先着・1枠の受付数）と、同じ店舗のスタッフ・設備の空きに、
 * 確認と登録の間で他の公開予約が割り込まないようにする。
 * 取る順番は常に リンク → 店舗（逆順で取る処理を作らないこと。デッドロックになる）。
 */
export async function lockPublicBooking(
  tx: Client,
  linkId: number,
  shopId: number,
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK_NS_LINK}::int, ${linkId}::int)`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK_NS_SHOP}::int, ${shopId}::int)`;
}

export type LinkStatus =
  | { state: "open"; message: null; remaining: number | null }
  | {
      state: Exclude<ScheduleState, "open">;
      message: string;
      remaining: number | null;
    };

/**
 * 今このリンクで予約を受け付けられるか（受付期間・受付日の残り・先着の定員）。
 * remaining は先着の残り件数（上限なしなら null）。
 */
export async function getLinkStatus(
  link: LoadedLink,
  nowMs: number,
): Promise<LinkStatus> {
  const s = link.schedule;
  const today = toLocalDateString(new Date(nowMs));
  // 件数は先着の上限があるときだけ数える（それ以外のリンクでは余計なクエリを打たない）
  const bookedCount =
    s.maxBookings != null &&
    scheduleState(s, { today, nowMs }) === "open"
      ? await countLinkBookings(db, link.id)
      : null;
  const state = scheduleState(s, { today, nowMs, bookedCount });
  const remaining =
    s.maxBookings != null && bookedCount != null
      ? Math.max(0, s.maxBookings - bookedCount)
      : null;
  switch (state) {
    case "open":
      return { state, message: null, remaining };
    case "before":
      return {
        state,
        message: `受付開始前です。${formatLongDateTime(s.openAt!, today)} から予約できます。`,
        remaining,
      };
    case "full":
      return {
        state,
        message: "定員に達したため、受付を終了しました。",
        remaining,
      };
    case "after":
    case "ended":
      return { state, message: "受付は終了しました。", remaining };
  }
}
