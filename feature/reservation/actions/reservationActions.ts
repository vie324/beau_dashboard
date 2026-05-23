"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/helper/lib/db";
import { getActiveShopId } from "@/helper/lib/shop-context";
import { getCurrentUser } from "@/helper/lib/auth";
import { jstDateTimeToDate, addMinutes } from "@/helper/utils/time";
import { FREEING_STATUSES } from "@/helper/utils/status";
import {
  appointmentSchema,
  timeBlockSchema,
  type AppointmentInput,
} from "@/feature/reservation/schema/reservationSchema";
import { sendBookingEmails } from "@/feature/notify/sendBookingEmails";

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string; conflict?: "staff" | "equipment" };

/**
 * True when the staff member has no overlapping appointment in the window.
 * Cancelled / no-show appointments do not block the slot.
 */
export async function checkStaffAvailability(params: {
  shopId: number;
  staffId: number;
  startAt: Date;
  endAt: Date;
  excludeAppointmentId?: number;
  // 最終受付モード等で kind="block" を無視するためのオプション。
  ignoreBlocks?: boolean;
}): Promise<{ available: boolean; conflictId?: number }> {
  const {
    shopId,
    staffId,
    startAt,
    endAt,
    excludeAppointmentId,
    ignoreBlocks,
  } = params;

  const conflict = await db.appointment.findFirst({
    where: {
      shopId,
      staffId,
      deletedAt: null,
      status: { notIn: FREEING_STATUSES },
      ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}),
      ...(ignoreBlocks ? { kind: { not: "block" } } : {}),
      startAt: { lt: endAt },
      endAt: { gt: startAt },
    },
    select: { id: true },
  });

  return conflict
    ? { available: false, conflictId: conflict.id }
    : { available: true };
}

/**
 * True when the equipment is free in the given window. Mirrors
 * checkStaffAvailability for the equipment dimension. kind="block" は
 * 通常スタッフ単位で入るので equipmentId は付いていないが、念のため
 * ignoreBlocks を受け取れるようにしておく。
 */
export async function checkEquipmentAvailability(params: {
  shopId: number;
  equipmentId: number;
  startAt: Date;
  endAt: Date;
  excludeAppointmentId?: number;
  ignoreBlocks?: boolean;
}): Promise<{ available: boolean; conflictId?: number }> {
  const {
    shopId,
    equipmentId,
    startAt,
    endAt,
    excludeAppointmentId,
    ignoreBlocks,
  } = params;

  const conflict = await db.appointment.findFirst({
    where: {
      shopId,
      equipmentId,
      deletedAt: null,
      status: { notIn: FREEING_STATUSES },
      ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}),
      ...(ignoreBlocks ? { kind: { not: "block" } } : {}),
      startAt: { lt: endAt },
      endAt: { gt: startAt },
    },
    select: { id: true },
  });

  return conflict
    ? { available: false, conflictId: conflict.id }
    : { available: true };
}

function parse(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  // Normalise empty strings to undefined so optional/nullable works.
  for (const k of Object.keys(raw)) {
    if (raw[k] === "") delete raw[k];
  }
  return appointmentSchema.safeParse(raw);
}

async function upsert(
  input: AppointmentInput,
  shopId: number,
): Promise<ActionResult> {
  const startAt = jstDateTimeToDate(input.date, input.startTime);
  const endAt = addMinutes(startAt, input.durationMin);

  // メニューから設備指定 (equipmentId) を引いて、予約時にも空き判定を行う。
  let equipmentId: number | null = null;
  if (input.menuId) {
    const menu = await db.menu.findFirst({
      where: { id: input.menuId, deletedAt: null },
      select: { equipmentId: true },
    });
    equipmentId = menu?.equipmentId ?? null;
  }

  // allowOverlap="1" のときは重複を許可（手動でのダブルブッキング）。
  // ネット予約は submitPublicBooking 側の判定を通るため、ここは手動登録専用。
  const allowOverlap = input.allowOverlap === "1";

  if (input.staffId && !allowOverlap) {
    const avail = await checkStaffAvailability({
      shopId,
      staffId: input.staffId,
      startAt,
      endAt,
      excludeAppointmentId: input.id,
    });
    if (!avail.available) {
      return {
        ok: false,
        error: "選択したスタッフはこの時間帯に別の予約があります",
        conflict: "staff",
      };
    }
  }

  if (equipmentId && !allowOverlap) {
    const avail = await checkEquipmentAvailability({
      shopId,
      equipmentId,
      startAt,
      endAt,
      excludeAppointmentId: input.id,
    });
    if (!avail.available) {
      return {
        ok: false,
        error: "この時間帯は対象の設備が他の予約で埋まっています",
        conflict: "equipment",
      };
    }
  }

  const data = {
    shopId,
    customerId: input.customerId ?? null,
    staffId: input.staffId ?? null,
    menuId: input.menuId ?? null,
    equipmentId,
    visitSourceId: input.visitSourceId ?? null,
    guestName: input.guestName ?? null,
    guestPhone: input.guestPhone ?? null,
    startAt,
    endAt,
    status: input.status,
    sales: input.sales ?? null,
    note: input.note ?? null,
  };

  let createdId: number | null = null;
  try {
    if (input.id) {
      const existing = await db.appointment.findFirst({
        where: { id: input.id, shopId, deletedAt: null },
        select: { id: true },
      });
      if (!existing) return { ok: false, error: "予約が見つかりません" };
      await db.appointment.update({ where: { id: input.id }, data });
    } else {
      const created = await db.appointment.create({
        data: { ...data, source: "manual" },
        select: { id: true },
      });
      createdId = created.id;
    }
  } catch {
    return { ok: false, error: "保存に失敗しました。時間をおいて再度お試しください" };
  }

  if (createdId != null) {
    // 新規予約の確定通知（顧客・店舗）。失敗しても予約自体は成功扱い。
    await sendBookingEmails(createdId);
  }

  revalidatePath("/reservation");
  return { ok: true };
}

export async function saveAppointment(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await getCurrentUser())) return { ok: false, error: "未認証です" };

  const parsed = parse(formData);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "入力内容を確認してください",
    };
  }
  const shopId = await getActiveShopId();
  return upsert(parsed.data, shopId);
}

export async function setAppointmentStatus(
  id: number,
  status: number,
): Promise<ActionResult> {
  if (!(await getCurrentUser())) return { ok: false, error: "未認証です" };

  const shopId = await getActiveShopId();
  const existing = await db.appointment.findFirst({
    where: { id, shopId, deletedAt: null },
    select: { id: true },
  });
  if (!existing) return { ok: false, error: "予約が見つかりません" };

  try {
    await db.appointment.update({ where: { id }, data: { status } });
  } catch {
    return { ok: false, error: "ステータスの変更に失敗しました" };
  }
  revalidatePath("/reservation");
  return { ok: true };
}

export async function deleteAppointment(id: number): Promise<ActionResult> {
  if (!(await getCurrentUser())) return { ok: false, error: "未認証です" };

  const shopId = await getActiveShopId();
  const existing = await db.appointment.findFirst({
    where: { id, shopId, deletedAt: null },
    select: { id: true },
  });
  if (!existing) return { ok: false, error: "予約が見つかりません" };

  try {
    await db.appointment.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  } catch {
    return { ok: false, error: "削除に失敗しました" };
  }
  revalidatePath("/reservation");
  return { ok: true };
}

export async function setAppointmentConfirmed(
  id: number,
  confirmed: boolean,
): Promise<ActionResult> {
  if (!(await getCurrentUser())) return { ok: false, error: "未認証です" };

  const shopId = await getActiveShopId();
  const existing = await db.appointment.findFirst({
    where: { id, shopId, deletedAt: null },
    select: { id: true },
  });
  if (!existing) return { ok: false, error: "予約が見つかりません" };

  try {
    await db.appointment.update({ where: { id }, data: { confirmed } });
  } catch {
    return { ok: false, error: "更新に失敗しました" };
  }
  revalidatePath("/reservation");
  return { ok: true };
}

/** 予約以外の時間ブロック（休憩・会議・私用 等）を作成・更新する。 */
export async function saveTimeBlock(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await getCurrentUser())) return { ok: false, error: "未認証です" };

  const raw = Object.fromEntries(formData.entries());
  for (const k of Object.keys(raw)) {
    if (raw[k] === "") delete raw[k];
  }
  const parsed = timeBlockSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "入力内容を確認してください",
    };
  }
  const input = parsed.data;
  const shopId = await getActiveShopId();
  const startAt = jstDateTimeToDate(input.date, input.startTime);
  const endAt = addMinutes(startAt, input.durationMin);

  if (input.id) {
    const existing = await db.appointment.findFirst({
      where: { id: input.id, shopId, deletedAt: null, kind: "block" },
      select: { id: true, staffId: true },
    });
    if (!existing) return { ok: false, error: "ブロックが見つかりません" };
    if (existing.staffId) {
      const avail = await checkStaffAvailability({
        shopId,
        staffId: existing.staffId,
        startAt,
        endAt,
        excludeAppointmentId: input.id,
      });
      if (!avail.available) {
        return { ok: false, error: "他の予約と時間が重なります" };
      }
    }
    try {
      await db.appointment.update({
        where: { id: input.id },
        data: { startAt, endAt, blockLabel: input.label ?? null },
      });
    } catch {
      return { ok: false, error: "保存に失敗しました" };
    }
    revalidatePath("/reservation");
    return { ok: true };
  }

  // 新規: 単独スタッフ
  if (input.staffId) {
    const avail = await checkStaffAvailability({
      shopId,
      staffId: input.staffId,
      startAt,
      endAt,
    });
    if (!avail.available) {
      return { ok: false, error: "そのスタッフはこの時間帯に他の予約があります" };
    }
    try {
      await db.appointment.create({
        data: {
          shopId,
          staffId: input.staffId,
          startAt,
          endAt,
          kind: "block",
          blockLabel: input.label ?? null,
          status: 0,
          source: "manual",
          confirmed: true,
        },
      });
    } catch {
      return { ok: false, error: "作成に失敗しました" };
    }
    revalidatePath("/reservation");
    return { ok: true };
  }

  // 新規: 全員ブロック（予約可能スタッフ全員に1件ずつ作成）
  const staffs = await db.staff.findMany({
    where: { shopId, deletedAt: null, isBookable: true },
    select: { id: true, name: true },
  });
  if (staffs.length === 0) {
    return { ok: false, error: "この店舗に対象スタッフがいません" };
  }
  for (const s of staffs) {
    const avail = await checkStaffAvailability({
      shopId,
      staffId: s.id,
      startAt,
      endAt,
    });
    if (!avail.available) {
      return {
        ok: false,
        error: `${s.name} はこの時間帯に他の予約があります（先に解消してください）`,
      };
    }
  }
  try {
    await db.appointment.createMany({
      data: staffs.map((s) => ({
        shopId,
        staffId: s.id,
        startAt,
        endAt,
        kind: "block",
        blockLabel: input.label ?? null,
        status: 0,
        source: "manual" as const,
        confirmed: true,
      })),
    });
  } catch {
    return { ok: false, error: "作成に失敗しました" };
  }
  revalidatePath("/reservation");
  return { ok: true };
}

export async function deleteTimeBlock(id: number): Promise<ActionResult> {
  if (!(await getCurrentUser())) return { ok: false, error: "未認証です" };

  const shopId = await getActiveShopId();
  const existing = await db.appointment.findFirst({
    where: { id, shopId, deletedAt: null, kind: "block" },
    select: { id: true },
  });
  if (!existing) return { ok: false, error: "ブロックが見つかりません" };

  try {
    await db.appointment.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  } catch {
    return { ok: false, error: "削除に失敗しました" };
  }
  revalidatePath("/reservation");
  return { ok: true };
}
