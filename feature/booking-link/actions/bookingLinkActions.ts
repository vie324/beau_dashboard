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
    allowedMenuIds,
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
    allowedMenuIds: JSON.stringify(input.allowedMenuIds),
    reminderSettings: JSON.stringify({
      enabled: input.reminderEnabled,
      hoursBefore: input.reminderHoursBefore,
    }),
  };

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

  await db.bookingLink.update({ where: { id }, data: { isActive } });
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

  await db.bookingLink.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
  revalidatePath("/booking-links");
  return { ok: true };
}
