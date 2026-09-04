"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/helper/lib/db";
import { getActiveShopId } from "@/helper/lib/shop-context";
import { getCurrentUser } from "@/helper/lib/auth";
import { couponSchema } from "@/feature/coupon/schema/couponSchema";
import { normalizeCouponCode } from "@/helper/utils/retail";
import { jstDateTimeToDate, addMinutes } from "@/helper/utils/time";

export type ActionResult = { ok: true } | { ok: false; error: string };

/** "YYYY-MM-DD"（JST）→ その日の 00:00 JST。 */
function startOfJstDay(ymd: string): Date {
  return jstDateTimeToDate(ymd, "00:00");
}
/** "YYYY-MM-DD"（JST）→ その日の 23:59:59.999 JST（翌日 0:00 の 1ms 前）。 */
function endOfJstDay(ymd: string): Date {
  return new Date(addMinutes(jstDateTimeToDate(ymd, "00:00"), 24 * 60).getTime() - 1);
}

export async function saveCoupon(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await getCurrentUser())) return { ok: false, error: "未認証です" };
  const raw = Object.fromEntries(formData.entries());
  raw.isActive = formData.get("isActive") ? "true" : "false";
  raw.showOnStore = formData.get("showOnStore") ? "true" : "false";
  for (const k of Object.keys(raw)) if (raw[k] === "") delete raw[k];
  const parsed = couponSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "入力内容を確認してください",
    };
  }
  const input = parsed.data;
  const shopId = await getActiveShopId();
  const code = normalizeCouponCode(input.code);

  const data = {
    code,
    name: input.name,
    type: input.type,
    value: input.value,
    minSubtotal: input.minSubtotal ?? 0,
    maxDiscount: input.type === "percent" ? (input.maxDiscount ?? 0) : 0,
    startsAt: input.startsAt ? startOfJstDay(input.startsAt) : null,
    expiresAt: input.expiresAt ? endOfJstDay(input.expiresAt) : null,
    usageLimit: input.usageLimit ?? null,
    isActive: input.isActive ?? true,
    showOnStore: input.showOnStore ?? false,
    note: input.note ?? null,
  };

  // コード重複（同一店舗・ソフトデリート済みも含めて衝突を検知）
  const dup = await db.coupon.findFirst({
    where: { shopId, code, ...(input.id ? { id: { not: input.id } } : {}) },
    select: { id: true, deletedAt: true },
  });
  if (dup) {
    return {
      ok: false,
      error: dup.deletedAt
        ? "このコードは削除済みのクーポンで使われています。別のコードにしてください"
        : "このクーポンコードは既に使われています",
    };
  }

  try {
    if (input.id) {
      const existing = await db.coupon.findFirst({
        where: { id: input.id, shopId, deletedAt: null },
        select: { id: true },
      });
      if (!existing) return { ok: false, error: "クーポンが見つかりません" };
      await db.coupon.update({ where: { id: input.id }, data });
    } else {
      await db.coupon.create({ data: { ...data, shopId } });
    }
  } catch (e) {
    const msg =
      e instanceof Error && e.message.includes("Unique")
        ? "このクーポンコードは既に使われています"
        : "保存に失敗しました。時間をおいて再度お試しください";
    return { ok: false, error: msg };
  }
  revalidatePath("/products");
  return { ok: true };
}

export async function setCouponActive(
  id: number,
  isActive: boolean,
): Promise<ActionResult> {
  if (!(await getCurrentUser())) return { ok: false, error: "未認証です" };
  const shopId = await getActiveShopId();
  const existing = await db.coupon.findFirst({
    where: { id, shopId, deletedAt: null },
    select: { id: true },
  });
  if (!existing) return { ok: false, error: "クーポンが見つかりません" };
  try {
    await db.coupon.update({ where: { id }, data: { isActive } });
  } catch {
    return { ok: false, error: "更新に失敗しました" };
  }
  revalidatePath("/products");
  return { ok: true };
}

export async function deleteCoupon(id: number): Promise<ActionResult> {
  if (!(await getCurrentUser())) return { ok: false, error: "未認証です" };
  const shopId = await getActiveShopId();
  const existing = await db.coupon.findFirst({
    where: { id, shopId, deletedAt: null },
    select: { id: true },
  });
  if (!existing) return { ok: false, error: "クーポンが見つかりません" };
  try {
    // 過去の注文は couponId で参照し続けるためソフトデリート。
    await db.coupon.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false, showOnStore: false },
    });
  } catch {
    return { ok: false, error: "削除に失敗しました" };
  }
  revalidatePath("/products");
  return { ok: true };
}
