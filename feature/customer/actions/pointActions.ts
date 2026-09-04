"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/helper/lib/db";
import { getActiveShopId } from "@/helper/lib/shop-context";
import { getCurrentUser } from "@/helper/lib/auth";
import { getCustomerPointHistory } from "@/feature/customer/services/getCustomerDetail";
import { getCustomerOrders } from "@/feature/order/services/getCustomerPurchases";

export type ActionResult = { ok: true } | { ok: false; error: string };

/** 顧客詳細モーダル用: 残高・ポイント台帳・購入履歴をまとめて取得。 */
export async function fetchCustomerDetail(customerId: number) {
  if (!(await getCurrentUser())) return null;
  const shopId = await getActiveShopId();
  const customer = await db.customer.findFirst({
    where: { id: customerId, shopId, deletedAt: null },
    select: { id: true, name: true, code: true, pointsBalance: true },
  });
  if (!customer) return null;
  const [points, orders] = await Promise.all([
    getCustomerPointHistory(shopId, customerId),
    getCustomerOrders(shopId, customerId),
  ]);
  return { customer, points, orders };
}

export type CustomerDetail = NonNullable<
  Awaited<ReturnType<typeof fetchCustomerDetail>>
>;

const adjustSchema = z.object({
  customerId: z.coerce.number().int().positive(),
  // 符号付き。+付与 / -減算（利用・訂正）
  points: z.coerce
    .number({ invalid_type_error: "ポイントは数値で入力してください" })
    .int("ポイントは整数で入力してください")
    .refine((v) => v !== 0, "ポイントは 0 以外を入力してください")
    .refine((v) => Math.abs(v) <= 1_000_000, "ポイントが大きすぎます"),
  reason: z
    .string()
    .trim()
    .min(1, "理由を入力してください（来院ポイント・店頭購入 など）")
    .max(100, "理由は100文字以内で入力してください"),
});

/**
 * 管理画面からの手動ポイント調整（来院ポイント・店頭購入分・誕生日ボーナス・訂正 等）。
 * 減算は残高不足にならないよう条件付き更新で守る（同時操作でもマイナスにならない）。
 */
export async function adjustCustomerPoints(input: {
  customerId: number;
  points: number;
  reason: string;
}): Promise<ActionResult> {
  if (!(await getCurrentUser())) return { ok: false, error: "未認証です" };
  const parsed = adjustSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "入力内容を確認してください",
    };
  }
  const { customerId, points, reason } = parsed.data;
  const shopId = await getActiveShopId();

  try {
    await db.$transaction(async (tx) => {
      const updated = await tx.customer.updateMany({
        where: {
          id: customerId,
          shopId,
          deletedAt: null,
          ...(points < 0 ? { pointsBalance: { gte: -points } } : {}),
        },
        data: { pointsBalance: { increment: points } },
      });
      if (updated.count === 0) {
        throw new Error(
          points < 0
            ? "ポイント残高が不足しています"
            : "顧客が見つかりません",
        );
      }
      await tx.pointTransaction.create({
        data: { shopId, customerId, type: "adjust", points, reason },
      });
    });
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "ポイントの更新に失敗しました",
    };
  }
  revalidatePath("/customers");
  return { ok: true };
}
