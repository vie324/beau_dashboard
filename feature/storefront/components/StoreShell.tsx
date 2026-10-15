import type { ReactNode } from "react";
import { StoreHeader } from "@/feature/storefront/components/StoreHeader";
import { StoreFooter } from "@/feature/storefront/components/StoreFooter";
import { StoreTopBar } from "@/feature/storefront/components/StoreTopBar";
import { storeBenefits, type BenefitShop } from "@/feature/storefront/lib/benefits";
import { cn } from "@/helper/utils/cn";

/**
 * 公開販売ページ共通の外枠。特典の帯 + sticky ヘッダー + コンテンツ + フッター。
 * width: "wide" = 商品一覧などの広いページ / "narrow" = 完了・マイページなど読み物寄り。
 * 送料・ポイントの設定を渡したページだけ、上部に特典の帯を出す。
 */
export function StoreShell({
  slug,
  shop,
  width = "wide",
  children,
}: {
  slug: string;
  shop: BenefitShop & {
    name: string;
    storeTitle: string | null;
    address?: string | null;
    phone?: string | null;
  };
  width?: "wide" | "narrow";
  children: ReactNode;
}) {
  const benefits = shop.shippingFee !== undefined ? storeBenefits(shop) : [];
  return (
    <div className="min-h-screen bg-base">
      {benefits.length > 0 && <StoreTopBar benefits={benefits} />}
      <StoreHeader slug={slug} title={shop.storeTitle || shop.name} />
      <main
        className={cn(
          "mx-auto px-4 pb-28 pt-5 sm:px-6 sm:pt-8",
          width === "wide" ? "max-w-6xl" : "max-w-3xl",
        )}
      >
        {children}
      </main>
      <StoreFooter
        slug={slug}
        shopName={shop.name}
        title={shop.storeTitle || shop.name}
        address={shop.address}
        phone={shop.phone}
      />
    </div>
  );
}
