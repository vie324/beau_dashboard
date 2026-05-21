import { PageHeader } from "@/components/layout/PageHeader";
import { getActiveShopId } from "@/helper/lib/shop-context";
import { getCustomers } from "@/feature/customer/services/getCustomers";
import { CustomersClient } from "@/feature/customer/components/CustomersClient";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const shopId = await getActiveShopId();
  const customers = await getCustomers(shopId);

  return (
    <>
      <PageHeader
        title="顧客"
        description="店舗の顧客情報（氏名・カナ・連絡先・メモ）を登録・編集します。予約モーダルから検索して指定できます。"
      />
      <CustomersClient customers={customers} />
    </>
  );
}
