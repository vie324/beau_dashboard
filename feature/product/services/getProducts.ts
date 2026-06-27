import { db } from "@/helper/lib/db";

/**
 * 店舗の商品一覧（在庫・カテゴリ込み）。管理画面用。
 */
export async function getProducts(shopId: number) {
  const products = await db.product.findMany({
    where: { shopId, deletedAt: null },
    orderBy: [{ sortNumber: "asc" }, { id: "asc" }],
    select: {
      id: true,
      shopId: true,
      categoryId: true,
      sku: true,
      name: true,
      description: true,
      price: true,
      cost: true,
      taxRate: true,
      imageUrls: true,
      isPublic: true,
      sortNumber: true,
      category: { select: { id: true, name: true } },
      inventory: { select: { quantity: true, safetyStock: true } },
    },
  });

  return products.map((p) => ({
    ...p,
    quantity: p.inventory?.quantity ?? 0,
    safetyStock: p.inventory?.safetyStock ?? 0,
    lowStock:
      (p.inventory?.quantity ?? 0) <= (p.inventory?.safetyStock ?? 0),
  }));
}

export type ProductRow = Awaited<ReturnType<typeof getProducts>>[number];

export async function getProductCategories(shopId: number) {
  return db.productCategory.findMany({
    where: { shopId, deletedAt: null },
    orderBy: [{ sortNumber: "asc" }, { id: "asc" }],
    select: { id: true, name: true, sortNumber: true },
  });
}

export type CategoryRow = Awaited<
  ReturnType<typeof getProductCategories>
>[number];

/** 直近の入出庫履歴（在庫管理タブ用）。 */
export async function getStockMovements(shopId: number, limit = 100) {
  return db.stockMovement.findMany({
    where: { shopId },
    orderBy: { id: "desc" },
    take: limit,
    select: {
      id: true,
      type: true,
      qty: true,
      reason: true,
      orderId: true,
      createdAt: true,
      product: { select: { id: true, name: true } },
    },
  });
}

export type StockMovementRow = Awaited<
  ReturnType<typeof getStockMovements>
>[number];
