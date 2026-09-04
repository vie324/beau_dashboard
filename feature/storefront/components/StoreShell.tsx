import type { ReactNode } from "react";
import { StoreHeader } from "@/feature/storefront/components/StoreHeader";
import { StoreFooter } from "@/feature/storefront/components/StoreFooter";
import { cn } from "@/helper/utils/cn";

/**
 * 公開販売ページ共通の外枠。sticky ヘッダー + コンテンツ + フッター。
 * width: "wide" = 商品一覧などの広いページ / "narrow" = 完了・マイページなど読み物寄り。
 */
export function StoreShell({
  slug,
  shop,
  width = "wide",
  children,
}: {
  slug: string;
  shop: {
    name: string;
    storeTitle: string | null;
    address?: string | null;
    phone?: string | null;
  };
  width?: "wide" | "narrow";
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-base">
      <StoreHeader slug={slug} title={shop.storeTitle || shop.name} />
      <main
        className={cn(
          "mx-auto px-4 pb-28 pt-4 sm:px-6 sm:pt-6",
          width === "wide" ? "max-w-6xl" : "max-w-3xl",
        )}
      >
        {children}
        <StoreFooter
          slug={slug}
          shopName={shop.name}
          address={shop.address}
          phone={shop.phone}
        />
      </main>
    </div>
  );
}
