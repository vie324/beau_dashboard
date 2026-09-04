import type { Metadata } from "next";
import { getStorefrontProduct } from "@/feature/storefront/services/getStorefront";
import { ProductDetailClient } from "@/feature/storefront/components/ProductDetailClient";
import { ReviewSection } from "@/feature/storefront/components/ReviewSection";
import { StoreUnavailable } from "@/feature/storefront/components/StoreUnavailable";
import { StoreShell } from "@/feature/storefront/components/StoreShell";
import { StarRating } from "@/feature/storefront/components/StarRating";
import { PriceTag } from "@/feature/storefront/components/PriceTag";
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
    product.tagline ||
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

  const { shop, product, categoryName, reviews, related } = data;

  return (
    <StoreShell slug={slug} shop={shop}>
      <nav aria-label="パンくず" className="mb-4 text-xs text-muted">
        <ol className="flex flex-wrap items-center gap-1">
          <li>
            <a href={`/shop/${slug}`} className="hover:text-accent">
              ストアトップ
            </a>
          </li>
          {categoryName && (
            <>
              <li aria-hidden>›</li>
              <li>{categoryName}</li>
            </>
          )}
          <li aria-hidden>›</li>
          <li className="truncate text-ink">{product.name}</li>
        </ol>
      </nav>

      <ProductDetailClient slug={slug} product={product} shop={shop} />

      <div id="reviews" className="scroll-mt-20">
        <ReviewSection
          slug={slug}
          productId={product.id}
          reviews={reviews}
          ratingAvg={product.ratingAvg}
          ratingCount={product.ratingCount}
        />
      </div>

      {related.length > 0 && (
        <section className="mt-10">
          <p className="text-[11px] uppercase tracking-[0.3em] text-accent">Related</p>
          <h2 className="mb-3 mt-1 font-display text-xl tracking-wide text-ink">
            こちらもおすすめ
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {related.map((p) => {
              const img = parseImageUrls(p.imageUrls)[0];
              return (
                <a
                  key={p.id}
                  href={`/shop/${slug}/item/${p.id}`}
                  className="group overflow-hidden rounded-2xl border border-line bg-surface shadow-panel transition-all hover:-translate-y-0.5 hover:border-accent/40"
                >
                  <div className="relative aspect-square overflow-hidden bg-elevated">
                    {img ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={img}
                        alt={p.name}
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : null}
                    {p.discountPercent > 0 && (
                      <span className="absolute left-2 top-2 rounded-full bg-danger px-2 py-0.5 text-[10px] font-bold text-white">
                        {p.discountPercent}%OFF
                      </span>
                    )}
                  </div>
                  <div className="p-2.5">
                    <div className="line-clamp-2 text-xs text-ink">{p.name}</div>
                    {p.ratingCount > 0 && (
                      <StarRating value={p.ratingAvg} size={11} className="mt-0.5" />
                    )}
                    <PriceTag
                      size="sm"
                      className="mt-0.5"
                      price={p.price}
                      compareAtPrice={p.compareAtPrice}
                      taxRate={p.taxRate}
                    />
                  </div>
                </a>
              );
            })}
          </div>
        </section>
      )}
    </StoreShell>
  );
}
