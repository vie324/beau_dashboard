import { db } from "@/helper/lib/db";

/** 公開ストアフロント（/shop/<slug>）のデータを取得。非公開・無効なら null。 */
export async function getStorefront(slug: string) {
  const shop = await db.shop.findFirst({
    where: {
      storeSlug: slug,
      storeActive: true,
      deletedAt: null,
      NOT: { storeSlug: null },
    },
    select: {
      id: true,
      name: true,
      storeSlug: true,
      storeTitle: true,
      storeDescription: true,
      shippingFee: true,
      freeShippingThreshold: true,
      pointRatePercent: true,
      legalInfo: true,
      address: true,
      phone: true,
    },
  });
  if (!shop || !shop.storeSlug) return null;

  const [products, categories] = await Promise.all([
    db.product.findMany({
      where: { shopId: shop.id, isPublic: true, deletedAt: null },
      orderBy: [{ sortNumber: "asc" }, { id: "asc" }],
      select: {
        id: true,
        categoryId: true,
        name: true,
        description: true,
        price: true,
        taxRate: true,
        imageUrls: true,
        createdAt: true,
        inventory: { select: { quantity: true } },
      },
    }),
    db.productCategory.findMany({
      where: { shopId: shop.id, deletedAt: null },
      orderBy: [{ sortNumber: "asc" }, { id: "asc" }],
      select: { id: true, name: true },
    }),
  ]);

  const reviewStats = await reviewStatsFor(
    shop.id,
    products.map((p) => p.id),
  );

  // 「新着」判定: 直近30日以内に作成された商品
  const newThreshold = Date.now() - 30 * 24 * 60 * 60 * 1000;

  return {
    shop,
    categories,
    products: products.map((p) => ({
      id: p.id,
      categoryId: p.categoryId,
      name: p.name,
      description: p.description,
      price: p.price,
      taxRate: p.taxRate,
      imageUrls: p.imageUrls,
      stock: p.inventory?.quantity ?? 0,
      isNew: p.createdAt.getTime() >= newThreshold,
      createdAt: p.createdAt.getTime(),
      ratingAvg: reviewStats.get(p.id)?.avg ?? 0,
      ratingCount: reviewStats.get(p.id)?.count ?? 0,
    })),
  };
}

export type StorefrontData = NonNullable<
  Awaited<ReturnType<typeof getStorefront>>
>;
export type StorefrontProduct = StorefrontData["products"][number];

/** 公開商品の単品取得（商品詳細ページ用）。レビュー・関連商品込み。 */
export async function getStorefrontProduct(slug: string, productId: number) {
  const data = await getStorefront(slug);
  if (!data) return null;
  const product = data.products.find((p) => p.id === productId);
  if (!product) return null;

  const reviews = await db.productReview.findMany({
    where: {
      shopId: data.shop.id,
      productId,
      isPublished: true,
      deletedAt: null,
    },
    orderBy: { id: "desc" },
    take: 50,
    select: {
      id: true,
      authorName: true,
      rating: true,
      title: true,
      comment: true,
      createdAt: true,
    },
  });

  // 関連商品: 同カテゴリ → 不足分は他カテゴリで補完。自分は除外、最大4件。
  const sameCat = data.products.filter(
    (p) => p.id !== productId && p.categoryId === product.categoryId,
  );
  const others = data.products.filter(
    (p) => p.id !== productId && p.categoryId !== product.categoryId,
  );
  const related = [...sameCat, ...others].slice(0, 4);

  return { shop: data.shop, product, reviews, related };
}

export type StorefrontReview = NonNullable<
  Awaited<ReturnType<typeof getStorefrontProduct>>
>["reviews"][number];

/** 商品ごとの公開レビュー集計（平均・件数）。 */
async function reviewStatsFor(
  shopId: number,
  productIds: number[],
): Promise<Map<number, { avg: number; count: number }>> {
  const map = new Map<number, { avg: number; count: number }>();
  if (productIds.length === 0) return map;
  const grouped = await db.productReview.groupBy({
    by: ["productId"],
    where: {
      shopId,
      productId: { in: productIds },
      isPublished: true,
      deletedAt: null,
    },
    _avg: { rating: true },
    _count: { _all: true },
  });
  for (const g of grouped) {
    map.set(g.productId, {
      avg: g._avg.rating ?? 0,
      count: g._count._all,
    });
  }
  return map;
}
