import type { Metadata } from "next";
import { getStorefrontProduct } from "@/feature/storefront/services/getStorefront";
import { ProductDetailClient } from "@/feature/storefront/components/ProductDetailClient";
import { ReviewSection } from "@/feature/storefront/components/ReviewSection";
import { StoreUnavailable } from "@/feature/storefront/components/StoreUnavailable";
import { StoreShell } from "@/feature/storefront/components/StoreShell";
import { RelatedProducts } from "@/feature/storefront/components/RelatedProducts";
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
      <nav aria-label="パンくず" className="mb-6 text-[11px] tracking-wider text-muted">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li>
            <a href={`/shop/${slug}`} className="transition-colors hover:text-accent">
              ストアトップ
            </a>
          </li>
          {categoryName && (
            <>
              <li aria-hidden className="text-faint">/</li>
              <li>{categoryName}</li>
            </>
          )}
          <li aria-hidden className="text-faint">/</li>
          <li className="truncate text-ink">{product.name}</li>
        </ol>
      </nav>

      <ProductDetailClient
        slug={slug}
        product={product}
        shop={shop}
        categoryName={categoryName}
      />

      <div id="reviews" className="scroll-mt-24">
        <ReviewSection
          slug={slug}
          productId={product.id}
          reviews={reviews}
          ratingAvg={product.ratingAvg}
          ratingCount={product.ratingCount}
        />
      </div>

      {related.length > 0 && (
        <RelatedProducts
          slug={slug}
          products={related}
          pointRatePercent={shop.pointRatePercent}
        />
      )}
    </StoreShell>
  );
}
