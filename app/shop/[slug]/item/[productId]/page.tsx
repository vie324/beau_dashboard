import type { Metadata } from "next";
import { getStorefrontProduct } from "@/feature/storefront/services/getStorefront";
import { AddToCartButton } from "@/feature/storefront/components/AddToCartButton";
import { StoreUnavailable } from "@/feature/storefront/components/StoreUnavailable";
import { Badge } from "@/components/ui/Badge";
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

  const { shop, product } = data;
  const images = parseImageUrls(product.imageUrls);

  return (
    <main className="min-h-screen px-4 py-8">
      <div className="mx-auto max-w-2xl">
        <a
          href={`/shop/${slug}`}
          className="mb-4 inline-block text-sm text-muted hover:text-accent"
        >
          ← {shop.storeTitle || shop.name} に戻る
        </a>

        <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-panel">
          <div className="aspect-square bg-elevated">
            {images[0] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={images[0]}
                alt={product.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-faint">
                No Image
              </div>
            )}
          </div>
          {images.length > 1 && (
            <div className="no-scrollbar flex gap-2 overflow-x-auto p-3">
              {images.slice(1).map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={i}
                  src={src}
                  alt={`${product.name} ${i + 2}`}
                  className="h-20 w-20 shrink-0 rounded-lg object-cover"
                />
              ))}
            </div>
          )}

          <div className="space-y-4 p-5">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold text-ink">
                  {product.name}
                </h1>
                {product.stock <= 0 && (
                  <Badge className="border-line bg-elevated text-muted">
                    在庫切れ
                  </Badge>
                )}
              </div>
              <p className="mt-2 text-2xl font-semibold tabular-nums text-ink">
                {formatYen(taxInclusiveUnit(product.price, product.taxRate))}
                <span className="ml-1 text-xs font-normal text-faint">
                  （税込）
                </span>
              </p>
            </div>

            {product.description && (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted">
                {product.description}
              </p>
            )}

            <AddToCartButton
              slug={slug}
              productId={product.id}
              stock={product.stock}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
