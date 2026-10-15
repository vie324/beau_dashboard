import { db } from "@/helper/lib/db";
import { getPointCampaignSupport } from "@/helper/lib/schemaSupport";
import { parsePointCampaigns } from "@/helper/utils/pointCampaign";

/** 物販ストアフロント設定（管理画面の設定カード用）。 */
export async function getShopRetail(shopId: number) {
  // 期間限定ポイントの列は DDL 未適用の本番に無いことがある（P2022 で物販画面が落ちる）。
  const withCampaigns = await getPointCampaignSupport();
  const shop = await db.shop.findFirst({
    where: { id: shopId, deletedAt: null },
    select: {
      id: true,
      name: true,
      storeActive: true,
      storeSlug: true,
      storeTitle: true,
      storeDescription: true,
      shippingFee: true,
      freeShippingThreshold: true,
      pointRatePercent: true,
      pointCampaigns: withCampaigns,
      allowPointRedeem: true,
      storeAnnouncement: true,
      storeHeroImageUrl: true,
      legalInfo: true,
      address: true,
      phone: true,
    },
  });
  if (!shop) return null;
  const { pointCampaigns, ...rest } = shop;
  return {
    ...rest,
    pointCampaigns: parsePointCampaigns(withCampaigns ? pointCampaigns : null),
    /** false = DDL 未適用で期間限定ポイントを保存できない */
    pointCampaignsSupported: withCampaigns,
  };
}

export type ShopRetail = NonNullable<Awaited<ReturnType<typeof getShopRetail>>>;
