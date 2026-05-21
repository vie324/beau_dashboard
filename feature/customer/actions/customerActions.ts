"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/helper/lib/db";
import { getActiveShopId } from "@/helper/lib/shop-context";
import { getCurrentUser } from "@/helper/lib/auth";
import { customerSchema } from "@/feature/customer/schema/customerSchema";

export type ActionResult = { ok: true } | { ok: false; error: string };

function parse(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  // 空文字は undefined 扱い（optional/nullable のため）
  for (const k of Object.keys(raw)) {
    if (raw[k] === "") delete raw[k];
  }
  return customerSchema.safeParse(raw);
}

export async function saveCustomer(
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
  const input = parsed.data;
  const shopId = await getActiveShopId();

  const data = {
    name: input.name,
    kana: input.kana ?? null,
    phone: input.phone ?? null,
    email: input.email ?? null,
    note: input.note ?? null,
  };

  try {
    if (input.id) {
      const existing = await db.customer.findFirst({
        where: { id: input.id, shopId, deletedAt: null },
        select: { id: true },
      });
      if (!existing) return { ok: false, error: "顧客が見つかりません" };
      await db.customer.update({ where: { id: input.id }, data });
    } else {
      await db.customer.create({ data: { ...data, shopId } });
    }
  } catch {
    return {
      ok: false,
      error: "保存に失敗しました。時間をおいて再度お試しください",
    };
  }

  revalidatePath("/customers");
  revalidatePath("/reservation");
  return { ok: true };
}

export async function deleteCustomer(id: number): Promise<ActionResult> {
  if (!(await getCurrentUser())) return { ok: false, error: "未認証です" };

  const shopId = await getActiveShopId();
  const existing = await db.customer.findFirst({
    where: { id, shopId, deletedAt: null },
    select: { id: true },
  });
  if (!existing) return { ok: false, error: "顧客が見つかりません" };

  try {
    await db.customer.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  } catch {
    return { ok: false, error: "削除に失敗しました" };
  }
  revalidatePath("/customers");
  revalidatePath("/reservation");
  return { ok: true };
}
