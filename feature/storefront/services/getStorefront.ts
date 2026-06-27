import { db } from "@/helper/lib/db";

/** 公開ストアフロント（/shop/<slug>）のデータを取得。非公開・無効なら null。 */
export async function getStorefront(slug: string) {
  const shop = await db.shop.findFirst({
    where: { storeSlug: slug, storeActive: true, deletedAt: null },
    select: {
      id: true,
      name: true,
      storeSlug: true,
      storeTitle: true,
      storeDescription: true,
      shippingFee: true,
      pointRatePercent: true,
    },
  });
  if (!shop) return null;

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
        inventory: { select: { quantity: true } },
      },
    }),
    db.productCategory.findMany({
      where: { shopId: shop.id, deletedAt: null },
      orderBy: [{ sortNumber: "asc" }, { id: "asc" }],
      select: { id: true, name: true },
    }),
  ]);

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
    })),
  };
}

export type StorefrontData = NonNullable<
  Awaited<ReturnType<typeof getStorefront>>
>;
export type StorefrontProduct = StorefrontData["products"][number];

/** 公開商品の単品取得（商品詳細ページ用）。 */
export async function getStorefrontProduct(slug: string, productId: number) {
  const data = await getStorefront(slug);
  if (!data) return null;
  const product = data.products.find((p) => p.id === productId);
  if (!product) return null;
  return { shop: data.shop, product };
}
