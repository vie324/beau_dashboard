import { db } from "@/helper/lib/db";
import { getPublicCoupons } from "@/feature/coupon/services/getCoupons";
import { discountPercent } from "@/helper/utils/retail";

// 「人気ランキング」の集計期間（日）。決済済み注文の販売数量を商品ごとに合計する。
const RANKING_DAYS = 90;
const RANKING_TOP = 3;

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
      storeAnnouncement: true,
      storeHeroImageUrl: true,
      shippingFee: true,
      freeShippingThreshold: true,
      pointRatePercent: true,
      allowPointRedeem: true,
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
        tagline: true,
        description: true,
        price: true,
        compareAtPrice: true,
        taxRate: true,
        imageUrls: true,
        isFeatured: true,
        featuredComment: true,
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

  const ids = products.map((p) => p.id);
  const [reviewStats, sales, coupons] = await Promise.all([
    reviewStatsFor(shop.id, ids),
    salesRankFor(shop.id, ids),
    getPublicCoupons(shop.id),
  ]);

  // 「新着」判定: 直近30日以内に作成された商品
  const newThreshold = Date.now() - 30 * 24 * 60 * 60 * 1000;

  return {
    shop,
    categories,
    coupons,
    products: products.map((p) => ({
      id: p.id,
      categoryId: p.categoryId,
      name: p.name,
      tagline: p.tagline,
      description: p.description,
      price: p.price,
      compareAtPrice: p.compareAtPrice,
      discountPercent: discountPercent(p.price, p.compareAtPrice),
      taxRate: p.taxRate,
      imageUrls: p.imageUrls,
      isFeatured: p.isFeatured,
      featuredComment: p.featuredComment,
      stock: p.inventory?.quantity ?? 0,
      isNew: p.createdAt.getTime() >= newThreshold,
      createdAt: p.createdAt.getTime(),
      ratingAvg: reviewStats.get(p.id)?.avg ?? 0,
      ratingCount: reviewStats.get(p.id)?.count ?? 0,
      soldCount: sales.get(p.id)?.sold ?? 0,
      // 1〜3 = 人気ランキング上位（販売実績がある商品のみ）。それ以外は null。
      salesRank: sales.get(p.id)?.rank ?? null,
    })),
  };
}

export type StorefrontData = NonNullable<
  Awaited<ReturnType<typeof getStorefront>>
>;
export type StorefrontProduct = StorefrontData["products"][number];
export type StorefrontShop = StorefrontData["shop"];

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
  const categoryName =
    data.categories.find((c) => c.id === product.categoryId)?.name ?? null;

  return {
    shop: data.shop,
    product,
    categoryName,
    reviews,
    related,
    coupons: data.coupons,
  };
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

/**
 * 商品ごとの販売数量（直近 RANKING_DAYS 日・決済済み注文）と人気ランキング順位。
 * 販売実績が 1 以上の商品だけに順位を付け、上位 RANKING_TOP 件までを返す。
 */
async function salesRankFor(
  shopId: number,
  productIds: number[],
): Promise<Map<number, { sold: number; rank: number | null }>> {
  const map = new Map<number, { sold: number; rank: number | null }>();
  if (productIds.length === 0) return map;
  const since = new Date(Date.now() - RANKING_DAYS * 24 * 60 * 60 * 1000);
  const grouped = await db.orderItem.groupBy({
    by: ["productId"],
    where: {
      productId: { in: productIds },
      order: {
        shopId,
        deletedAt: null,
        paymentStatus: "paid",
        paidAt: { gte: since },
      },
    },
    _sum: { qty: true },
  });
  const sorted = grouped
    .map((g) => ({ productId: g.productId, sold: g._sum.qty ?? 0 }))
    .filter((g): g is { productId: number; sold: number } =>
      g.productId != null && g.sold > 0,
    )
    .sort((a, b) => b.sold - a.sold || a.productId - b.productId);
  sorted.forEach((g, i) => {
    map.set(g.productId, { sold: g.sold, rank: i < RANKING_TOP ? i + 1 : null });
  });
  return map;
}
