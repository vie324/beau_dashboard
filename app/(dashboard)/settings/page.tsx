import { PageHeader } from "@/components/layout/PageHeader";
import { getActiveBrandId, getActiveShopId } from "@/helper/lib/shop-context";
import { getSettingsData } from "@/feature/settings/services/getSettingsData";
import { SettingsClient } from "@/feature/settings/components/SettingsClient";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [brandId, shopId] = await Promise.all([
    getActiveBrandId(),
    getActiveShopId(),
  ]);
  const data = await getSettingsData(brandId, shopId);
  const activeShopName =
    data.shops.find((s) => s.id === shopId)?.name ?? "現在の店舗";

  return (
    <>
      <PageHeader
        title="設定"
        description="店舗・スタッフ・メニューを編集します。仮データはここから自由に書き換えできます。"
      />
      <SettingsClient
        shops={data.shops}
        staffs={data.staffs}
        equipments={data.equipments}
        menus={data.menus}
        visitSources={data.visitSources}
        cardColorPresets={data.cardColorPresets}
        activeShopName={activeShopName}
      />
    </>
  );
}
