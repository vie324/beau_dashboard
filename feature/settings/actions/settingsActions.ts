"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/helper/lib/db";
import { getCurrentUser } from "@/helper/lib/auth";
import { getActiveBrandId, getActiveShopId } from "@/helper/lib/shop-context";
import {
  shopSchema,
  staffSchema,
  menuSchema,
} from "@/feature/settings/schema/settingsSchema";

export type ActionResult = { ok: true } | { ok: false; error: string };

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
