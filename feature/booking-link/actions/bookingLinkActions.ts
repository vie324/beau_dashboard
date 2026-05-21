"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/helper/lib/db";
import { getCurrentUser } from "@/helper/lib/auth";
import { getActiveBrandId } from "@/helper/lib/shop-context";
import { bookingLinkSchema } from "@/feature/booking-link/schema/bookingLinkSchema";

export type ActionResult = { ok: true } | { ok: false; error: string };

function readForm(formData: FormData) {
  let allowedMenuIds: number[] = [];
  try {
    const raw = formData.get("allowedMenuIds");
    if (typeof raw === "string" && raw) {
      const v = JSON.parse(raw);
      if (Array.isArray(v)) allowedMenuIds = v.map(Number);
    }
  } catch {
    allowedMenuIds = [];
  }

  return {
    id: formData.get("id") ? Number(formData.get("id")) : undefined,
    slug: String(formData.get("slug") ?? ""),
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? "") || undefined,
    shopId: formData.get("shopId")
      ? Number(formData.get("shopId"))
      : undefined,
    isActive: formData.get("isActive") === "true",
    requireStaffSelection: formData.get("requireStaffSelection") === "true",
    allowOverflowAtBreak:
      (formData.get("allowOverflowAtBreak") ?? "true") === "true",
    allowOverflowAtClose:
      (formData.get("allowOverflowAtClose") ?? "true") === "true",
    allowedMenuIds,
    intervalMin: Number(formData.get("intervalMin") ?? 30),
    reminderEnabled: formData.get("reminderEnabled") === "true",
    reminderHoursBefore: Number(formData.get("reminderHoursBefore") ?? 24),
  };
}

export async function saveBookingLink(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await getCurrentUser())) return { ok: false, error: "未認証です" };

  const parsed = bookingLinkSchema.safeParse(readForm(formData));
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "入力内容を確認してください",
    };
  }
  const input = parsed.data;
  const brandId = await getActiveBrandId();

  const clash = await db.bookingLink.findFirst({
    where: {
      slug: input.slug,
      deletedAt: null,
      ...(input.id ? { id: { not: input.id } } : {}),
    },
    select: { id: true },
  });
  if (clash) {
    return { ok: false, error: `slug「${input.slug}」は既に使われています` };
  }

  const data = {
    brandId,
    shopId: input.shopId ?? null,
    slug: input.slug,
    name: input.name,
    description: input.description ?? null,
    isActive: input.isActive,
    requireStaffSelection: input.requireStaffSelection,
    allowOverflowAtBreak: input.allowOverflowAtBreak,
    allowOverflowAtClose: input.allowOverflowAtClose,
    intervalMin: input.intervalMin,
    allowedMenuIds: JSON.stringify(input.allowedMenuIds),
    reminderSettings: JSON.stringify({
      enabled: input.reminderEnabled,
      hoursBefore: input.reminderHoursBefore,
    }),
  };

  try {
    if (input.id) {
      const existing = await db.bookingLink.findFirst({
        where: { id: input.id, brandId, deletedAt: null },
        select: { id: true },
      });
      if (!existing) return { ok: false, error: "リンクが見つかりません" };
      await db.bookingLink.update({ where: { id: input.id }, data });
    } else {
      await db.bookingLink.create({ data });
    }
  } catch (e) {
    if (
      e &&
      typeof e === "object" &&
      "code" in e &&
      (e as { code?: string }).code === "P2002"
    ) {
      return { ok: false, error: `slug「${input.slug}」は既に使われています` };
    }
    return { ok: false, error: "保存に失敗しました。時間をおいて再度お試しください" };
  }

  revalidatePath("/booking-links");
  return { ok: true };
}

export async function toggleBookingLink(
  id: number,
  isActive: boolean,
): Promise<ActionResult> {
  if (!(await getCurrentUser())) return { ok: false, error: "未認証です" };
  const brandId = await getActiveBrandId();
  const existing = await db.bookingLink.findFirst({
    where: { id, brandId, deletedAt: null },
    select: { id: true },
  });
  if (!existing) return { ok: false, error: "リンクが見つかりません" };

  try {
    await db.bookingLink.update({ where: { id }, data: { isActive } });
  } catch {
    return { ok: false, error: "状態の変更に失敗しました" };
  }
  revalidatePath("/booking-links");
  return { ok: true };
}

export async function deleteBookingLink(id: number): Promise<ActionResult> {
  if (!(await getCurrentUser())) return { ok: false, error: "未認証です" };
  const brandId = await getActiveBrandId();
  const existing = await db.bookingLink.findFirst({
    where: { id, brandId, deletedAt: null },
    select: { id: true },
  });
  if (!existing) return { ok: false, error: "リンクが見つかりません" };

  try {
    await db.bookingLink.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  } catch {
    return { ok: false, error: "削除に失敗しました" };
  }
  revalidatePath("/booking-links");
  return { ok: true };
}
