import { getStorefront } from "@/feature/storefront/services/getStorefront";
import { StoreUnavailable } from "@/feature/storefront/components/StoreUnavailable";
import { StoreShell } from "@/feature/storefront/components/StoreShell";
import { CheckoutClient } from "@/feature/storefront/components/CheckoutClient";
import { ChevronLeftIcon } from "@/feature/storefront/components/icons";

export const dynamic = "force-dynamic";

export const metadata = { title: "ご購入手続き" };

export default async function CheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ canceled?: string; order?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const data = await getStorefront(slug);
  if (!data) return <StoreUnavailable />;

  return (
    <StoreShell slug={slug} shop={data.shop}>
      <a
        href={`/shop/${slug}`}
        className="inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-accent"
      >
        <ChevronLeftIcon size={16} />
        買い物を続ける
      </a>
      <div className="mb-8 mt-4">
        <p className="font-accent text-md italic tracking-[0.28em] text-accent">Checkout</p>
        <h1 className="mt-1 font-display text-[1.6rem] font-semibold tracking-[0.1em] text-ink sm:text-[2rem]">
          ご購入手続き
        </h1>
      </div>
      <CheckoutClient
        data={data}
        canceledOrderNo={sp.canceled ? (sp.order ?? null) : null}
      />
    </StoreShell>
  );
}
