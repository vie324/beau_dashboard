import { PageHeader } from "@/components/layout/PageHeader";
import { getActiveShopId } from "@/helper/lib/shop-context";
import { getOrders, getSalesSummary } from "@/feature/order/services/getOrders";
import { OrdersClient } from "@/feature/order/components/OrdersClient";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const shopId = await getActiveShopId();
  const [orders, summary] = await Promise.all([
    getOrders(shopId),
    getSalesSummary(shopId),
  ]);

  return (
    <>
      <PageHeader
        title="注文"
        description="お客様向け販売ページからの注文と売上を管理します。在庫・利用ポイント・クーポンは注文作成時に引き当てられ、決済完了で会員にポイントが付与されます。キャンセルすると在庫とポイントが戻ります。"
      />
      <OrdersClient orders={orders} summary={summary} />
    </>
  );
}
