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

  // レビュー集計（公開・未削除のみ）
  const reviewMap = new Map<number, { avg: number; count: number }>();
  if (products.length > 0) {
    const grouped = await db.productReview.groupBy({
      by: ["productId"],
      where: {
        shopId,
        productId: { in: products.map((p) => p.id) },
        isPublished: true,
        deletedAt: null,
      },
      _avg: { rating: true },
      _count: { _all: true },
    });
    for (const g of grouped) {
      reviewMap.set(g.productId, {
        avg: g._avg.rating ?? 0,
        count: g._count._all,
      });
    }
  }

  return products.map((p) => ({
    ...p,
    quantity: p.inventory?.quantity ?? 0,
    safetyStock: p.inventory?.safetyStock ?? 0,
    lowStock:
      (p.inventory?.quantity ?? 0) <= (p.inventory?.safetyStock ?? 0),
    ratingAvg: reviewMap.get(p.id)?.avg ?? 0,
    ratingCount: reviewMap.get(p.id)?.count ?? 0,
  }));
}

/** 1商品の全レビュー（管理モデレーション用。非公開も含む）。 */
export async function getProductReviews(shopId: number, productId: number) {
  return db.productReview.findMany({
    where: { shopId, productId, deletedAt: null },
    orderBy: { id: "desc" },
    select: {
      id: true,
      authorName: true,
      rating: true,
      title: true,
      comment: true,
      isPublished: true,
      createdAt: true,
    },
  });
}

export type AdminReviewRow = Awaited<
  ReturnType<typeof getProductReviews>
>[number];

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
