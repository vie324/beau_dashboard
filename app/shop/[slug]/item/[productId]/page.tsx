import type { Metadata } from "next";
import { getStorefrontProduct } from "@/feature/storefront/services/getStorefront";
import { ProductDetailClient } from "@/feature/storefront/components/ProductDetailClient";
import { ReviewSection } from "@/feature/storefront/components/ReviewSection";
import { StoreUnavailable } from "@/feature/storefront/components/StoreUnavailable";
import { StarRating } from "@/feature/storefront/components/StarRating";
import { formatYen, taxInclusiveUnit, parseImageUrls } from "@/helper/utils/retail";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; productId: string }>;
}): Promise<Metadata> {
  const { slug, productId } = await params;
  const id = Number(productId);
  if (!Number.isInteger(id)) return { title: "商品" };
  const data = await getStorefrontProduct(slug, id);
  if (!data) return { title: "商品" };
  const { product } = data;
  const img = parseImageUrls(product.imageUrls)[0];
  const description =
    product.description?.slice(0, 120) ||
    `${product.name} を販売中。${formatYen(taxInclusiveUnit(product.price, product.taxRate))}（税込）`;
  return {
    title: product.name,
    description,
    openGraph: {
      title: product.name,
      description,
      type: "website",
      images: img ? [{ url: img }] : undefined,
    },
  };
}

export default async function StorefrontItemPage({
  params,
}: {
  params: Promise<{ slug: string; productId: string }>;
}) {
  const { slug, productId } = await params;
  const id = Number(productId);
  if (!Number.isInteger(id)) return <StoreUnavailable />;

  const data = await getStorefrontProduct(slug, id);
  if (!data) return <StoreUnavailable />;

  const { shop, product, reviews, related } = data;

  return (
    <main className="min-h-screen bg-base px-4 py-8">
      <div className="mx-auto max-w-2xl">
        <a
          href={`/shop/${slug}`}
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-accent"
        >
          ← {shop.storeTitle || shop.name} に戻る
        </a>

        <ProductDetailClient slug={slug} product={product} />

        <ReviewSection
          slug={slug}
          productId={product.id}
          reviews={reviews}
          ratingAvg={product.ratingAvg}
          ratingCount={product.ratingCount}
        />

        {related.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-3 text-base font-semibold text-ink">
              こちらもおすすめ
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {related.map((p) => {
                const img = parseImageUrls(p.imageUrls)[0];
                return (
                  <a
                    key={p.id}
                    href={`/shop/${slug}/item/${p.id}`}
                    className="group overflow-hidden rounded-xl border border-line bg-surface shadow-panel transition-all hover:-translate-y-0.5 hover:border-accent/40"
                  >
                    <div className="aspect-square overflow-hidden bg-elevated">
                      {img ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={img}
                          alt={p.name}
                          loading="lazy"
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                      ) : null}
                    </div>
                    <div className="p-2">
                      <div className="line-clamp-2 text-xs text-ink">{p.name}</div>
                      {p.ratingCount > 0 && (
                        <StarRating value={p.ratingAvg} size={11} className="mt-0.5" />
                      )}
                      <div className="mt-0.5 text-xs font-semibold tabular-nums text-ink">
                        {formatYen(taxInclusiveUnit(p.price, p.taxRate))}
                      </div>
                    </div>
                  </a>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
