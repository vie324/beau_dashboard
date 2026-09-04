import { getStorefront } from "@/feature/storefront/services/getStorefront";
import { StoreUnavailable } from "@/feature/storefront/components/StoreUnavailable";
import { StoreShell } from "@/feature/storefront/components/StoreShell";
import { parseLegalInfo } from "@/helper/utils/retail";

export const dynamic = "force-dynamic";

export const metadata = { title: "特定商取引法に基づく表記" };

export default async function LegalPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await getStorefront(slug);
  if (!data) return <StoreUnavailable />;

  const { shop } = data;
  const legal = parseLegalInfo(shop.legalInfo);

  // 未入力欄は店舗マスタの情報でフォールバック
  const rows: { label: string; value: string }[] = [
    { label: "販売事業者", value: legal.sellerName || shop.name },
    { label: "運営責任者", value: legal.manager || "" },
    { label: "所在地", value: legal.address || shop.address || "" },
    { label: "電話番号", value: legal.phone || shop.phone || "" },
    { label: "メールアドレス", value: legal.email || "" },
    { label: "受付時間", value: legal.hours || "" },
    { label: "販売価格", value: "各商品ページに税込価格で表示" },
    {
      label: "商品代金以外の費用",
      value: legal.extraFees || "配送の場合の送料、決済手数料",
    },
    {
      label: "お支払い方法",
      value: legal.paymentMethods || "クレジットカード決済（Stripe）",
    },
    { label: "引渡し時期", value: legal.deliveryTime || "" },
    { label: "返品・交換", value: legal.returnPolicy || "" },
  ].filter((r) => r.value.trim() !== "");

  return (
    <StoreShell slug={slug} shop={shop} width="narrow">
      <h1 className="mb-1 font-display text-2xl tracking-wide text-ink">
        特定商取引法に基づく表記
      </h1>
      <p className="mb-6 text-sm text-muted">{shop.name}</p>

      <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-panel">
        <dl className="divide-y divide-line/70">
          {rows.map((r) => (
            <div
              key={r.label}
              className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:gap-4"
            >
              <dt className="w-40 shrink-0 text-xs font-medium uppercase tracking-wider text-muted">
                {r.label}
              </dt>
              <dd className="whitespace-pre-wrap text-sm text-ink">{r.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </StoreShell>
  );
}
