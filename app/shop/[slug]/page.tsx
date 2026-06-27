import { getStorefront } from "@/feature/storefront/services/getStorefront";
import { StorefrontClient } from "@/feature/storefront/components/StorefrontClient";
import { StoreUnavailable } from "@/feature/storefront/components/StoreUnavailable";

export const dynamic = "force-dynamic";

export default async function StorefrontPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ cart?: string; canceled?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const data = await getStorefront(slug);

  if (!data) return <StoreUnavailable />;

  return (
    <main className="min-h-screen px-4 py-8">
      <div className="mx-auto max-w-3xl">
        <header className="mb-6 text-center">
          <div className="font-display text-2xl tracking-[0.18em] text-accent">
            {data.shop.storeTitle || data.shop.name}
          </div>
          <p className="mt-1 text-xs uppercase tracking-[0.3em] text-faint">
            Online Store
          </p>
          {data.shop.storeDescription && (
            <p className="mx-auto mt-3 max-w-xl text-sm text-muted">
              {data.shop.storeDescription}
            </p>
          )}
        </header>

        {sp.canceled && (
          <p className="mb-4 rounded-xl border border-warn/30 bg-warn/10 px-4 py-2 text-center text-sm text-warn">
            決済がキャンセルされました。カートの内容は保持されています。
          </p>
        )}

        <StorefrontClient data={data} openCartInitially={sp.cart === "open"} />

        <footer className="mt-10 text-center text-xs text-faint">
          {data.shop.name}
        </footer>
      </div>
    </main>
  );
}
