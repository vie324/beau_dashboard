"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { db } from "@/helper/lib/db";
import { getCurrentUser } from "@/helper/lib/auth";
import { getActiveBrandId, getActiveShopId } from "@/helper/lib/shop-context";
import { getNotifySupport } from "@/helper/lib/schemaSupport";
import {
  shopSchema,
  staffSchema,
  equipmentSchema,
  menuSchema,
  visitSourceSchema,
  cardColorPresetSchema,
  specialDaySchema,
} from "@/feature/settings/schema/settingsSchema";
import {
  parseHoursByDow,
  serializeHoursByDow,
  parseDateOverrides,
  serializeDateOverrides,
  editDateOverrides,
  type DateOverride,
} from "@/helper/utils/shopHours";
import { isYmd } from "@/helper/utils/pointCampaign";
import { parseWorkDates, serializeWorkDates } from "@/helper/utils/staffWork";
import { parseStaffIds } from "@/helper/utils/menuStaff";

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

  // 通知設定の列は手動マイグレーション未適用の本番DBには存在しない。
  // 書き込みに混ぜると店舗の保存ごと P2022 で失敗するため、列がある場合だけ含める。
  const notifySupport = await getNotifySupport();
  const notifyData = notifySupport.columns
    ? {
        notifyEmail: input.notifyEmail || null,
        notifyManualBooking: input.notifyManualBooking,
      }
    : {};

  const base = {
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
  };

  try {
    if (input.id) {
      const exists = await db.shop.findFirst({
        where: { id: input.id, brandId, deletedAt: null },
        select: { id: true },
      });
      if (!exists) return fail("店舗が見つかりません");
      // select を付けて書き込み後の RETURNING を id だけに絞る。既定では
      // モデルの全列を返そうとするため、手動マイグレーション未適用のDBでは
      // data に含めていない notifyEmail 等を読みに行って P2022 で落ちる。
      await db.shop.update({
        where: { id: input.id },
        data: { ...base, ...notifyData },
        select: { id: true },
      });
    } else {
      await db.shop.create({
        data: { brandId, ...base, ...notifyData },
        select: { id: true },
      });
    }
  } catch {
    return fail("保存に失敗しました。時間をおいて再度お試しください");
  }

  if (!notifySupport.columns) {
    // 店舗情報は保存できているので、通知設定だけ保存できなかったことを伝える。
    revalidateAll();
    return fail(
      "店舗情報は保存しました。通知設定はデータベースの更新（prisma/manual-migrations.sql）が未適用のため保存されていません",
    );
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
    await db.shop.update({
      where: { id },
      data: { deletedAt: new Date() },
      select: { id: true },
    });
  } catch {
    return fail("削除に失敗しました");
  }
  revalidateAll();
  return { ok: true };
}

/* ---------------- Special days（特別営業日・臨時休診） ---------------- */

/**
 * 特別営業日・臨時休診を、選んだ店舗にまとめて登録・変更する。
 * 各店舗の dateOverrides（日付ごとの設定）に書き込むので、店舗の編集画面の
 * カレンダーにも同じ内容が出る。編集のときは、元の日付の設定を元の対象店舗から
 * 消してから入れ直す（日付の変更・対象から外した店舗に古い設定が残らないように）。
 */
export async function saveSpecialDay(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await requireAuth())) return fail("未認証です");
  const parsed = specialDaySchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const input = parsed.data;
  const brandId = await getActiveBrandId();

  const override: DateOverride = { type: input.type };
  if (input.type === "custom") {
    override.openTime = input.openTime;
    override.closeTime = input.closeTime;
    if (input.breakStart && input.breakEnd) {
      override.breakStart = input.breakStart;
      override.breakEnd = input.breakEnd;
    }
  }
  if (input.note) override.note = input.note;

  const setIds = new Set(input.shopIds);
  const prevIds = new Set(input.prevDate ? (input.prevShopIds ?? []) : []);
  return updateShopDateOverrides(
    brandId,
    [...new Set([...setIds, ...prevIds])],
    input.shopIds,
    (shopId) => ({
      remove: prevIds.has(shopId) ? input.prevDate : null,
      set: setIds.has(shopId) ? { date: input.date, override } : null,
    }),
  );
}

/** 特別営業日・臨時休診の登録を、指定した店舗から消す（その日は通常の営業時間に戻る）。 */
export async function deleteSpecialDay(
  date: string,
  shopIds: number[],
): Promise<ActionResult> {
  if (!(await requireAuth())) return fail("未認証です");
  if (!isYmd(date)) return fail("日付が正しくありません");
  const ids = [...new Set(shopIds)].filter((n) => Number.isInteger(n) && n > 0);
  if (ids.length === 0) return fail("店舗が見つかりません");
  const brandId = await getActiveBrandId();
  return updateShopDateOverrides(brandId, ids, [], () => ({ remove: date }));
}

/**
 * 複数店舗の dateOverrides を読み→書き換え→保存する。required の店舗がブランド内に
 * 1つでも無ければ何も書かずに失敗を返す。
 */
async function updateShopDateOverrides(
  brandId: number,
  shopIds: number[],
  required: number[],
  change: (shopId: number) => Parameters<typeof editDateOverrides>[1],
): Promise<ActionResult> {
  if (shopIds.length === 0) return fail("店舗が見つかりません");
  try {
    const missing = await db.$transaction(async (tx) => {
      // 同じ店舗の設定を同時に書き換えたとき、片方の変更が消えないように行ロックを取る。
      await tx.$queryRaw`SELECT "id" FROM "Shop" WHERE "id" IN (${Prisma.join(shopIds)}) AND "brandId" = ${brandId} FOR UPDATE`;
      const shops = await tx.shop.findMany({
        where: { id: { in: shopIds }, brandId, deletedAt: null },
        select: { id: true, dateOverrides: true },
      });
      if (required.some((id) => !shops.some((s) => s.id === id))) return true;
      for (const shop of shops) {
        await tx.shop.update({
          where: { id: shop.id },
          data: { dateOverrides: editDateOverrides(shop.dateOverrides, change(shop.id)) },
          select: { id: true },
        });
      }
      return false;
    });
    if (missing) return fail("店舗が見つかりません");
  } catch {
    return fail("保存に失敗しました。時間をおいて再度お試しください");
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
    // メニューの「対応スタッフ」からも外す（残しても判定には効かないが、
    // 設定画面に消えた人の分が残らないようにする）。
    await db.menuStaff.deleteMany({ where: { staffId: id } });
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

/**
 * メニューの「対応スタッフ」を保存する。
 * 表示中の店舗のスタッフぶんだけを差し替えるので、全店舗共通メニューでも
 * 他店舗で設定した対応スタッフは消えない。空配列 = この店舗では制限なし。
 */
async function syncMenuStaff(
  menuId: number,
  shopId: number,
  rawStaffIds: string | null | undefined,
) {
  // フィールド自体が送られていないフォームでは、既存の設定を消さない。
  if (rawStaffIds === undefined) return;
  const shopStaffIds = (
    await db.staff.findMany({
      where: { shopId, deletedAt: null },
      select: { id: true },
    })
  ).map((s) => s.id);
  const wanted = parseStaffIds(rawStaffIds).filter((id) =>
    shopStaffIds.includes(id),
  );

  await db.menuStaff.deleteMany({
    where: { menuId, staffId: { in: shopStaffIds } },
  });
  if (wanted.length) {
    await db.menuStaff.createMany({
      data: wanted.map((staffId) => ({ menuId, staffId })),
      skipDuplicates: true,
    });
  }
}

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
      await syncMenuStaff(input.id, shopId, input.staffIds);
    } else {
      const prefix = input.brandCommon ? "BRD" : "STR";
      const menuManageId = `${prefix}-${Date.now().toString(36).toUpperCase()}`;
      const created = await db.menu.create({
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
        select: { id: true },
      });
      await syncMenuStaff(created.id, shopId, input.staffIds);
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
