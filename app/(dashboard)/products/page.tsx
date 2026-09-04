import { PageHeader } from "@/components/layout/PageHeader";
import { getActiveShopId } from "@/helper/lib/shop-context";
import {
  getProducts,
  getProductCategories,
  getStockMovements,
} from "@/feature/product/services/getProducts";
import { getShopRetail } from "@/feature/order/services/getShopRetail";
import { getCoupons } from "@/feature/coupon/services/getCoupons";
import { ProductsClient } from "@/feature/product/components/ProductsClient";
import { appBaseUrl } from "@/helper/lib/stripe";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const shopId = await getActiveShopId();
  const [products, categories, movements, shop, coupons] = await Promise.all([
    getProducts(shopId),
    getProductCategories(shopId),
    getStockMovements(shopId),
    getShopRetail(shopId),
    getCoupons(shopId),
  ]);

  if (!shop) {
    return (
      <PageHeader
        title="物販"
        description="店舗が見つかりません。設定を確認してください。"
      />
    );
  }

  return (
    <>
      <PageHeader
        title="物販"
        description="商品マスタと在庫を管理します。発注点を割ると在庫アラートを表示します。お客様向け販売ページの公開設定・クーポン・おすすめ/セール表示もここから行えます。"
      />
      <ProductsClient
        products={products}
        categories={categories}
        movements={movements}
        shop={shop}
        coupons={coupons}
        appUrl={appBaseUrl()}
      />
    </>
  );
}
