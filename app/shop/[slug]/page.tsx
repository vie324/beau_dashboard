import type { Metadata } from "next";
import { getStorefront } from "@/feature/storefront/services/getStorefront";
import { StorefrontClient } from "@/feature/storefront/components/StorefrontClient";
import { StoreUnavailable } from "@/feature/storefront/components/StoreUnavailable";
import { StoreShell } from "@/feature/storefront/components/StoreShell";
import { StoreHero } from "@/feature/storefront/components/StoreHero";
import { parseImageUrls } from "@/helper/utils/retail";

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
  const ogImage =
    data.shop.storeHeroImageUrl ||
    data.products.map((p) => parseImageUrls(p.imageUrls)[0]).find(Boolean);
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

  // ヒーローの写真: 設定したヒーロー画像 → おすすめ商品 → その他の商品（最大3枚・重複なし）
  const productImages = [
    ...data.products.filter((p) => p.isFeatured),
    ...data.products.filter((p) => !p.isFeatured),
  ].map((p) => parseImageUrls(p.imageUrls)[0]);
  const heroImages = [
    ...new Set(
      [data.shop.storeHeroImageUrl, ...productImages].filter(
        (u): u is string => Boolean(u),
      ),
    ),
  ].slice(0, 3);

  return (
    <StoreShell slug={slug} shop={data.shop}>
      <StoreHero
        shop={data.shop}
        coupons={data.coupons}
        images={heroImages}
        hasPicks={data.products.some((p) => p.isFeatured)}
      />

      {sp.canceled && (
        <p className="mt-4 rounded-2xl border border-warn/30 bg-warn/10 px-4 py-2.5 text-center text-sm text-warn">
          決済がキャンセルされました。カートの内容は保持されています。
        </p>
      )}

      <div className="mt-14 sm:mt-20">
        <StorefrontClient data={data} openCartInitially={sp.cart === "open"} />
      </div>
    </StoreShell>
  );
}
