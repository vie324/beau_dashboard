import type { Metadata } from "next";
import { getStorefront } from "@/feature/storefront/services/getStorefront";
import { StorefrontClient } from "@/feature/storefront/components/StorefrontClient";
import { StoreUnavailable } from "@/feature/storefront/components/StoreUnavailable";
import { StoreFooter } from "@/feature/storefront/components/StoreFooter";
import { formatYen, parseImageUrls } from "@/helper/utils/retail";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const data = await getStorefront(slug);
  if (!data) return { title: "オンラインストア" };
  const title = data.shop.storeTitle || `${data.shop.name} オンラインストア`;
  const description =
    data.shop.storeDescription ||
    `${data.shop.name}のオンラインストア。セルフケアグッズを販売しています。`;
  const ogImage = data.products
    .map((p) => parseImageUrls(p.imageUrls)[0])
    .find(Boolean);
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      images: ogImage ? [{ url: ogImage }] : undefined,
    },
  };
}

export default async function StorefrontPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ cart?: string; canceled?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const data = await getStorefront(slug);

  if (!data) return <StoreUnavailable />;

  const { shop } = data;
  const badges: string[] = ["店頭受取OK"];
  if (shop.freeShippingThreshold > 0 && shop.shippingFee > 0)
    badges.push(`${formatYen(shop.freeShippingThreshold)}以上で送料無料`);
  else if (shop.shippingFee === 0) badges.push("全国送料無料");
  if (shop.pointRatePercent > 0)
    badges.push(`ポイント${shop.pointRatePercent}%還元`);

  return (
    <main className="min-h-screen bg-base px-4 py-8">
      <div className="mx-auto max-w-3xl">
        <header className="mb-6 text-center">
          <div className="font-display text-2xl tracking-[0.18em] text-accent sm:text-3xl">
            {shop.storeTitle || shop.name}
          </div>
          <p className="mt-1 text-xs uppercase tracking-[0.3em] text-faint">
            Online Store
          </p>
          {shop.storeDescription && (
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted">
              {shop.storeDescription}
            </p>
          )}
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {badges.map((b) => (
              <span
                key={b}
                className="rounded-full border border-accent/30 bg-accent-soft px-3 py-1 text-xs font-medium text-accent-fg"
              >
                {b}
              </span>
            ))}
          </div>
        </header>

        {sp.canceled && (
          <p className="mb-4 rounded-xl border border-warn/30 bg-warn/10 px-4 py-2 text-center text-sm text-warn">
            決済がキャンセルされました。カートの内容は保持されています。
          </p>
        )}

        <StorefrontClient data={data} openCartInitially={sp.cart === "open"} />

        <StoreFooter
          slug={slug}
          shopName={shop.name}
          address={shop.address}
          phone={shop.phone}
        />
      </div>
    </main>
  );
}
