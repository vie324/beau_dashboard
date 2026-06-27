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
        description="お客様向け販売ページからの注文と売上を管理します。決済が完了した注文は在庫が自動で引き当てられ、会員にはポイントが付与されます。"
      />
      <OrdersClient orders={orders} summary={summary} />
    </>
  );
}
