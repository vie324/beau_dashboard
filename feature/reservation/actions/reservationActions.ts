"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/helper/lib/db";
import { getActiveShopId } from "@/helper/lib/shop-context";
import { getCurrentUser } from "@/helper/lib/auth";
import { jstDateTimeToDate, addMinutes } from "@/helper/utils/time";
import { FREEING_STATUSES } from "@/helper/utils/status";
import {
  appointmentSchema,
  type AppointmentInput,
} from "@/feature/reservation/schema/reservationSchema";

export type ActionResult = { ok: true } | { ok: false; error: string };

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
}): Promise<{ available: boolean; conflictId?: number }> {
  const { shopId, staffId, startAt, endAt, excludeAppointmentId } = params;

  const conflict = await db.appointment.findFirst({
    where: {
      shopId,
      staffId,
      deletedAt: null,
      status: { notIn: FREEING_STATUSES },
      ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}),
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

  if (input.staffId) {
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
      };
    }
  }

  const data = {
    shopId,
    customerId: input.customerId ?? null,
    staffId: input.staffId ?? null,
    menuId: input.menuId ?? null,
    visitSourceId: input.visitSourceId ?? null,
    guestName: input.guestName ?? null,
    guestPhone: input.guestPhone ?? null,
    startAt,
    endAt,
    status: input.status,
    sales: input.sales ?? null,
    note: input.note ?? null,
  };

  try {
    if (input.id) {
      const existing = await db.appointment.findFirst({
        where: { id: input.id, shopId, deletedAt: null },
        select: { id: true },
      });
      if (!existing) return { ok: false, error: "予約が見つかりません" };
      await db.appointment.update({ where: { id: input.id }, data });
    } else {
      await db.appointment.create({ data: { ...data, source: "manual" } });
    }
  } catch {
    return { ok: false, error: "保存に失敗しました。時間をおいて再度お試しください" };
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
