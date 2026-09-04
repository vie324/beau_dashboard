import { getStorefront } from "@/feature/storefront/services/getStorefront";
import { StoreUnavailable } from "@/feature/storefront/components/StoreUnavailable";
import { StoreShell } from "@/feature/storefront/components/StoreShell";
import { MemberClient } from "@/feature/storefront/components/MemberClient";

export const dynamic = "force-dynamic";

export const metadata = { title: "マイページ" };

export default async function MemberPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await getStorefront(slug);
  if (!data) return <StoreUnavailable />;

  return (
    <StoreShell slug={slug} shop={data.shop} width="narrow">
      <MemberClient
        slug={slug}
        pointRatePercent={data.shop.pointRatePercent}
        allowPointRedeem={data.shop.allowPointRedeem}
      />
    </StoreShell>
  );
}
