"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/helper/lib/db";
import { getActiveShopId } from "@/helper/lib/shop-context";
import { getCurrentUser } from "@/helper/lib/auth";
import {
  productSchema,
  categorySchema,
  stockAdjustSchema,
  storefrontSettingsSchema,
} from "@/feature/product/schema/productSchema";
import { parseImageUrls } from "@/helper/utils/retail";

export type ActionResult = { ok: true } | { ok: false; error: string };

function imageTextToJson(text: string | null | undefined): string | null {
  if (!text) return null;
  const urls = text
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
  return urls.length ? JSON.stringify(urls) : null;
}

export async function saveProduct(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await getCurrentUser())) return { ok: false, error: "未認証です" };

  const raw = Object.fromEntries(formData.entries());
  // チェックボックスは存在しなければ false 扱い
  raw.isPublic = formData.get("isPublic") ? "true" : "false";
  for (const k of Object.keys(raw)) {
    if (raw[k] === "") delete raw[k];
  }
  const parsed = productSchema.safeParse(raw);
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
    sku: input.sku ?? null,
    categoryId: input.categoryId ?? null,
    description: input.description ?? null,
    price: input.price,
    cost: input.cost ?? 0,
    taxRate: input.taxRate ?? 10,
    imageUrls: imageTextToJson(input.imageUrlsText),
    isPublic: input.isPublic ?? true,
  };

  try {
    if (input.id) {
      const existing = await db.product.findFirst({
        where: { id: input.id, shopId, deletedAt: null },
        select: { id: true },
      });
      if (!existing) return { ok: false, error: "商品が見つかりません" };
      await db.product.update({ where: { id: input.id }, data });
    } else {
      await db.product.create({
        data: {
          ...data,
          shopId,
          inventory: {
            create: {
              shopId,
              quantity: input.initialStock ?? 0,
              safetyStock: input.safetyStock ?? 0,
            },
          },
          ...(input.initialStock && input.initialStock > 0
            ? {
                movements: {
                  create: {
                    shopId,
                    type: "in",
                    qty: input.initialStock,
                    reason: "初期在庫",
                  },
                },
              }
            : {}),
        },
      });
    }
  } catch (e) {
    const msg =
      e instanceof Error && e.message.includes("Unique")
        ? "同じ商品コード(SKU)が既に存在します"
        : "保存に失敗しました。時間をおいて再度お試しください";
    return { ok: false, error: msg };
  }

  revalidatePath("/products");
  return { ok: true };
}

export async function deleteProduct(id: number): Promise<ActionResult> {
  if (!(await getCurrentUser())) return { ok: false, error: "未認証です" };
  const shopId = await getActiveShopId();
  const existing = await db.product.findFirst({
    where: { id, shopId, deletedAt: null },
    select: { id: true },
  });
  if (!existing) return { ok: false, error: "商品が見つかりません" };
  try {
    await db.product.update({
      where: { id },
      data: { deletedAt: new Date(), isPublic: false },
    });
  } catch {
    return { ok: false, error: "削除に失敗しました" };
  }
  revalidatePath("/products");
  return { ok: true };
}

export async function adjustStock(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await getCurrentUser())) return { ok: false, error: "未認証です" };

  const raw = Object.fromEntries(formData.entries());
  for (const k of Object.keys(raw)) {
    if (raw[k] === "") delete raw[k];
  }
  const parsed = stockAdjustSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "入力内容を確認してください",
    };
  }
  const { productId, type, amount, safetyStock, reason } = parsed.data;
  const shopId = await getActiveShopId();

  try {
    await db.$transaction(async (tx) => {
      const inv = await tx.inventoryItem.findFirst({
        where: { productId, shopId },
      });
      if (!inv) throw new Error("在庫レコードが見つかりません");

      let delta: number;
      let movementQty: number;
      if (type === "adjust") {
        // amount は調整後の実在庫数
        delta = amount - inv.quantity;
        movementQty = delta;
      } else if (type === "in") {
        delta = amount;
        movementQty = amount;
      } else {
        // waste
        delta = -amount;
        movementQty = -amount;
      }
      const next = inv.quantity + delta;
      if (next < 0) throw new Error("在庫がマイナスになる操作はできません");

      await tx.inventoryItem.update({
        where: { id: inv.id },
        data: {
          quantity: next,
          ...(safetyStock != null ? { safetyStock } : {}),
        },
      });
      if (movementQty !== 0) {
        await tx.stockMovement.create({
          data: {
            shopId,
            productId,
            type,
            qty: movementQty,
            reason: reason ?? null,
          },
        });
      }
    });
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "在庫の更新に失敗しました",
    };
  }

  revalidatePath("/products");
  return { ok: true };
}

export async function saveCategory(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await getCurrentUser())) return { ok: false, error: "未認証です" };
  const raw = Object.fromEntries(formData.entries());
  for (const k of Object.keys(raw)) if (raw[k] === "") delete raw[k];
  const parsed = categorySchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "入力内容を確認してください",
    };
  }
  const { id, name, sortNumber } = parsed.data;
  const shopId = await getActiveShopId();
  try {
    if (id) {
      const existing = await db.productCategory.findFirst({
        where: { id, shopId, deletedAt: null },
        select: { id: true },
      });
      if (!existing) return { ok: false, error: "カテゴリが見つかりません" };
      await db.productCategory.update({
        where: { id },
        data: { name, sortNumber: sortNumber ?? 0 },
      });
    } else {
      await db.productCategory.create({
        data: { shopId, name, sortNumber: sortNumber ?? 0 },
      });
    }
  } catch {
    return { ok: false, error: "保存に失敗しました" };
  }
  revalidatePath("/products");
  return { ok: true };
}

export async function deleteCategory(id: number): Promise<ActionResult> {
  if (!(await getCurrentUser())) return { ok: false, error: "未認証です" };
  const shopId = await getActiveShopId();
  const existing = await db.productCategory.findFirst({
    where: { id, shopId, deletedAt: null },
    select: { id: true },
  });
  if (!existing) return { ok: false, error: "カテゴリが見つかりません" };
  try {
    await db.$transaction([
      db.product.updateMany({
        where: { categoryId: id, shopId },
        data: { categoryId: null },
      }),
      db.productCategory.update({
        where: { id },
        data: { deletedAt: new Date() },
      }),
    ]);
  } catch {
    return { ok: false, error: "削除に失敗しました" };
  }
  revalidatePath("/products");
  return { ok: true };
}

export async function saveStorefrontSettings(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await getCurrentUser())) return { ok: false, error: "未認証です" };
  const raw = Object.fromEntries(formData.entries());
  raw.storeActive = formData.get("storeActive") ? "true" : "false";
  for (const k of Object.keys(raw)) if (raw[k] === "") delete raw[k];
  const parsed = storefrontSettingsSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "入力内容を確認してください",
    };
  }
  const input = parsed.data;
  const shopId = await getActiveShopId();

  // slug 重複チェック（他店舗と被らないように）
  const slug = input.storeSlug ? input.storeSlug : null;
  if (slug) {
    const dup = await db.shop.findFirst({
      where: { storeSlug: slug, id: { not: shopId }, deletedAt: null },
      select: { id: true },
    });
    if (dup) return { ok: false, error: "このURLスラッグは既に使われています" };
  }
  if (input.storeActive && !slug) {
    return { ok: false, error: "公開するにはURLスラッグを設定してください" };
  }

  try {
    await db.shop.update({
      where: { id: shopId },
      data: {
        storeActive: input.storeActive ?? false,
        storeSlug: slug,
        storeTitle: input.storeTitle ?? null,
        storeDescription: input.storeDescription ?? null,
        shippingFee: input.shippingFee ?? 0,
        pointRatePercent: input.pointRatePercent ?? 0,
      },
    });
  } catch {
    return { ok: false, error: "保存に失敗しました" };
  }
  revalidatePath("/products");
  return { ok: true };
}
