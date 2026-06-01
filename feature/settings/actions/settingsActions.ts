"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/helper/lib/db";
import { getCurrentUser } from "@/helper/lib/auth";
import { getActiveBrandId, getActiveShopId } from "@/helper/lib/shop-context";
import {
  shopSchema,
  staffSchema,
  equipmentSchema,
  menuSchema,
  visitSourceSchema,
  cardColorPresetSchema,
} from "@/feature/settings/schema/settingsSchema";
import {
  parseHoursByDow,
  serializeHoursByDow,
  parseDateOverrides,
  serializeDateOverrides,
} from "@/helper/utils/shopHours";
import { parseWorkDates, serializeWorkDates } from "@/helper/utils/staffWork";

/** Round-trip the work-dates JSON: drop invalid entries before persisting. */
function cleanWorkDates(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return serializeWorkDates(parseWorkDates(raw));
}

export type ActionResult = { ok: true } | { ok: false; error: string };

/** Round-trip the JSON: drop unknown keys / invalid times before persisting. */
function cleanHoursByDow(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return serializeHoursByDow(parseHoursByDow(raw));
}

function cleanDateOverrides(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return serializeDateOverrides(parseDateOverrides(raw));
}

function fail(msg: string): ActionResult {
  return { ok: false, error: msg };
}

function revalidateAll() {
  revalidatePath("/settings");
  revalidatePath("/reservation");
  revalidatePath("/", "layout");
}

async function requireAuth(): Promise<boolean> {
  return Boolean(await getCurrentUser());
}

function firstIssue(e: { issues?: { message: string }[] }): string {
  return e.issues?.[0]?.message ?? "入力内容を確認してください";
}

/* ---------------- Shops ---------------- */

export async function saveShop(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await requireAuth())) return fail("未認証です");
  const parsed = shopSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const input = parsed.data;
  const brandId = await getActiveBrandId();

  try {
    if (input.id) {
      const exists = await db.shop.findFirst({
        where: { id: input.id, brandId, deletedAt: null },
        select: { id: true },
      });
      if (!exists) return fail("店舗が見つかりません");
      await db.shop.update({
        where: { id: input.id },
        data: {
          name: input.name,
          sortNumber: input.sortNumber,
          address: input.address || null,
          phone: input.phone || null,
          lineUrl: input.lineUrl || null,
          openTime: input.openTime || null,
          closeTime: input.closeTime || null,
          breakStart: input.breakStart || null,
          breakEnd: input.breakEnd || null,
          hoursByDow: cleanHoursByDow(input.hoursByDow),
          dateOverrides: cleanDateOverrides(input.dateOverrides),
        },
      });
    } else {
      await db.shop.create({
        data: {
          brandId,
          name: input.name,
          sortNumber: input.sortNumber,
          address: input.address || null,
          phone: input.phone || null,
          lineUrl: input.lineUrl || null,
          openTime: input.openTime || null,
          closeTime: input.closeTime || null,
          breakStart: input.breakStart || null,
          breakEnd: input.breakEnd || null,
          hoursByDow: cleanHoursByDow(input.hoursByDow),
          dateOverrides: cleanDateOverrides(input.dateOverrides),
        },
      });
    }
  } catch {
    return fail("保存に失敗しました。時間をおいて再度お試しください");
  }
  revalidateAll();
  return { ok: true };
}

export async function deleteShop(id: number): Promise<ActionResult> {
  if (!(await requireAuth())) return fail("未認証です");
  const brandId = await getActiveBrandId();
  const exists = await db.shop.findFirst({
    where: { id, brandId, deletedAt: null },
    select: { id: true },
  });
  if (!exists) return fail("店舗が見つかりません");

  const remaining = await db.shop.count({
    where: { brandId, deletedAt: null },
  });
  if (remaining <= 1) return fail("最後の店舗は削除できません");

  try {
    await db.shop.update({ where: { id }, data: { deletedAt: new Date() } });
  } catch {
    return fail("削除に失敗しました");
  }
  revalidateAll();
  return { ok: true };
}

/* ---------------- Staff ---------------- */

export async function saveStaff(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await requireAuth())) return fail("未認証です");
  const parsed = staffSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const input = parsed.data;
  const shopId = await getActiveShopId();

  try {
    if (input.id) {
      const exists = await db.staff.findFirst({
        where: { id: input.id, shopId, deletedAt: null },
        select: { id: true },
      });
      if (!exists) return fail("スタッフが見つかりません");
      await db.staff.update({
        where: { id: input.id },
        data: {
          name: input.name,
          color: input.color,
          allocateOrder: input.allocateOrder,
          isBookable: input.isBookable,
          spotMode: input.spotMode,
          workDates: input.spotMode ? cleanWorkDates(input.workDates) : null,
        },
      });
    } else {
      await db.staff.create({
        data: {
          shopId,
          name: input.name,
          color: input.color,
          allocateOrder: input.allocateOrder,
          isBookable: input.isBookable,
          spotMode: input.spotMode,
          workDates: input.spotMode ? cleanWorkDates(input.workDates) : null,
        },
      });
    }
  } catch {
    return fail("保存に失敗しました。時間をおいて再度お試しください");
  }
  revalidateAll();
  return { ok: true };
}

export async function deleteStaff(id: number): Promise<ActionResult> {
  if (!(await requireAuth())) return fail("未認証です");
  const shopId = await getActiveShopId();
  const exists = await db.staff.findFirst({
    where: { id, shopId, deletedAt: null },
    select: { id: true },
  });
  if (!exists) return fail("スタッフが見つかりません");
  try {
    await db.staff.update({ where: { id }, data: { deletedAt: new Date() } });
  } catch {
    return fail("削除に失敗しました");
  }
  revalidateAll();
  return { ok: true };
}

/* ---------------- Equipment (設備：楽トレ・水素吸引機 等) ---------------- */

export async function saveEquipment(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await requireAuth())) return fail("未認証です");
  const parsed = equipmentSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const input = parsed.data;
  const shopId = await getActiveShopId();

  try {
    if (input.id) {
      const exists = await db.equipment.findFirst({
        where: { id: input.id, shopId, deletedAt: null },
        select: { id: true },
      });
      if (!exists) return fail("設備が見つかりません");
      await db.equipment.update({
        where: { id: input.id },
        data: {
          name: input.name,
          color: input.color,
          sortNumber: input.sortNumber,
          isBookable: input.isBookable,
        },
      });
    } else {
      await db.equipment.create({
        data: {
          shopId,
          name: input.name,
          color: input.color,
          sortNumber: input.sortNumber,
          isBookable: input.isBookable,
        },
      });
    }
  } catch {
    return fail("保存に失敗しました。時間をおいて再度お試しください");
  }
  revalidateAll();
  return { ok: true };
}

export async function deleteEquipment(id: number): Promise<ActionResult> {
  if (!(await requireAuth())) return fail("未認証です");
  const shopId = await getActiveShopId();
  const exists = await db.equipment.findFirst({
    where: { id, shopId, deletedAt: null },
    select: { id: true },
  });
  if (!exists) return fail("設備が見つかりません");

  const usingMenus = await db.menu.count({
    where: { equipmentId: id, deletedAt: null },
  });
  if (usingMenus > 0) {
    return fail(
      `この設備を使うメニューが ${usingMenus} 件あります。先にメニュー側の紐付けを変更してください`,
    );
  }
  try {
    await db.equipment.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  } catch {
    return fail("削除に失敗しました");
  }
  revalidateAll();
  return { ok: true };
}

/* ---------------- Menus ---------------- */

export async function saveMenu(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await requireAuth())) return fail("未認証です");
  const parsed = menuSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const input = parsed.data;
  const shopId = await getActiveShopId();
  const targetShopId = input.brandCommon ? null : shopId;

  try {
    if (input.id) {
      const exists = await db.menu.findFirst({
        where: {
          id: input.id,
          deletedAt: null,
          OR: [{ shopId: null }, { shopId }],
        },
        select: { id: true },
      });
      if (!exists) return fail("メニューが見つかりません");
      await db.menu.update({
        where: { id: input.id },
        data: {
          name: input.name,
          durationMin: input.durationMin,
          price: input.price,
          isPublic: input.isPublic,
          sortNumber: input.sortNumber,
          shopId: targetShopId,
          requiresStaff: input.requiresStaff,
          equipmentId: input.equipmentId ?? null,
        },
      });
    } else {
      const prefix = input.brandCommon ? "BRD" : "STR";
      const menuManageId = `${prefix}-${Date.now().toString(36).toUpperCase()}`;
      await db.menu.create({
        data: {
          menuManageId,
          name: input.name,
          durationMin: input.durationMin,
          price: input.price,
          isPublic: input.isPublic,
          sortNumber: input.sortNumber,
          shopId: targetShopId,
          requiresStaff: input.requiresStaff,
          equipmentId: input.equipmentId ?? null,
        },
      });
    }
  } catch {
    return fail("保存に失敗しました。時間をおいて再度お試しください");
  }
  revalidateAll();
  return { ok: true };
}

export async function deleteMenu(id: number): Promise<ActionResult> {
  if (!(await requireAuth())) return fail("未認証です");
  const shopId = await getActiveShopId();
  const exists = await db.menu.findFirst({
    where: { id, deletedAt: null, OR: [{ shopId: null }, { shopId }] },
    select: { id: true },
  });
  if (!exists) return fail("メニューが見つかりません");
  try {
    await db.menu.update({ where: { id }, data: { deletedAt: new Date() } });
  } catch {
    return fail("削除に失敗しました");
  }
  revalidateAll();
  return { ok: true };
}

/* ---------------- Visit sources (来店経路) ---------------- */

export async function saveVisitSource(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await requireAuth())) return fail("未認証です");
  const parsed = visitSourceSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const input = parsed.data;
  const shopId = await getActiveShopId();

  try {
    if (input.id) {
      const exists = await db.visitSource.findFirst({
        where: { id: input.id, shopId, deletedAt: null },
        select: { id: true },
      });
      if (!exists) return fail("経路が見つかりません");
      await db.visitSource.update({
        where: { id: input.id },
        data: { name: input.name, sortNumber: input.sortNumber },
      });
    } else {
      await db.visitSource.create({
        data: { shopId, name: input.name, sortNumber: input.sortNumber },
      });
    }
  } catch {
    return fail("保存に失敗しました。時間をおいて再度お試しください");
  }
  revalidateAll();
  return { ok: true };
}

export async function deleteVisitSource(id: number): Promise<ActionResult> {
  if (!(await requireAuth())) return fail("未認証です");
  const shopId = await getActiveShopId();
  const exists = await db.visitSource.findFirst({
    where: { id, shopId, deletedAt: null },
    select: { id: true },
  });
  if (!exists) return fail("経路が見つかりません");
  try {
    await db.visitSource.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  } catch {
    return fail("削除に失敗しました");
  }
  revalidateAll();
  return { ok: true };
}

/* ---------- CardColorPreset CRUD ---------- */

export async function saveCardColorPreset(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await requireAuth())) return fail("未認証です");
  const parsed = cardColorPresetSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const input = parsed.data;
  const shopId = await getActiveShopId();
  try {
    if (input.id) {
      const exists = await db.cardColorPreset.findFirst({
        where: { id: input.id, shopId, deletedAt: null },
        select: { id: true },
      });
      if (!exists) return fail("色プリセットが見つかりません");
      await db.cardColorPreset.update({
        where: { id: input.id },
        data: {
          name: input.name,
          hexColor: input.hexColor,
          sortNumber: input.sortNumber,
        },
      });
    } else {
      await db.cardColorPreset.create({
        data: {
          shopId,
          name: input.name,
          hexColor: input.hexColor,
          sortNumber: input.sortNumber,
        },
      });
    }
  } catch {
    return fail("保存に失敗しました。時間をおいて再度お試しください");
  }
  revalidateAll();
  return { ok: true };
}

export async function deleteCardColorPreset(id: number): Promise<ActionResult> {
  if (!(await requireAuth())) return fail("未認証です");
  const shopId = await getActiveShopId();
  const exists = await db.cardColorPreset.findFirst({
    where: { id, shopId, deletedAt: null },
    select: { id: true },
  });
  if (!exists) return fail("色プリセットが見つかりません");
  try {
    await db.cardColorPreset.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  } catch {
    return fail("削除に失敗しました");
  }
  revalidateAll();
  return { ok: true };
}

/** Idempotently create the standard set for the active shop. */
export async function ensureDefaultVisitSources(): Promise<ActionResult> {
  if (!(await requireAuth())) return fail("未認証です");
  const shopId = await getActiveShopId();
  const defaults = ["紹介", "meta", "チラシ", "HP"];
  try {
    const existing = await db.visitSource.findMany({
      where: { shopId, deletedAt: null },
      select: { name: true },
    });
    const have = new Set(existing.map((v) => v.name));
    const missing = defaults.filter((n) => !have.has(n));
    if (missing.length) {
      await db.visitSource.createMany({
        data: missing.map((name, i) => ({
          shopId,
          name,
          sortNumber: existing.length + i + 1,
        })),
      });
    }
  } catch {
    return fail("作成に失敗しました");
  }
  revalidateAll();
  return { ok: true };
}
