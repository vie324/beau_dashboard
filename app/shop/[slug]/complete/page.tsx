import { getOrderForComplete } from "@/feature/storefront/services/getOrderForComplete";
import { StoreUnavailable } from "@/feature/storefront/components/StoreUnavailable";
import { StoreShell } from "@/feature/storefront/components/StoreShell";
import { ClearCartOnComplete } from "@/feature/storefront/components/ClearCartOnComplete";
import { Badge } from "@/components/ui/Badge";
import { CheckIcon, StoreIcon, TruckIcon, CoinIcon } from "@/feature/storefront/components/icons";
import {
  formatYen,
  taxInclusiveUnit,
  FULFILLMENT_LABELS,
} from "@/helper/utils/retail";

export const dynamic = "force-dynamic";

export const metadata = { title: "ご注文完了" };

export default async function CompletePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ order?: string }>;
}) {
  const { slug } = await params;
  const { order: orderNo } = await searchParams;
  if (!orderNo) return <StoreUnavailable />;

  const data = await getOrderForComplete(slug, orderNo);
  if (!data) return <StoreUnavailable />;

  const { shop, order } = data;
  const paid = order.paymentStatus === "paid";

  return (
    <StoreShell slug={slug} shop={shop} width="narrow">
      <ClearCartOnComplete slug={slug} />
      <div className="mx-auto max-w-md">
        <div className="rounded-3xl border border-line bg-surface p-6 text-center shadow-panel sm:p-8">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-ok/15 text-ok">
            <CheckIcon size={28} />
          </div>
          <h1 className="mt-4 font-display text-xl tracking-wide text-ink">
            ご注文ありがとうございます
          </h1>
          <p className="mt-1 font-mono text-sm text-muted">{order.orderNo}</p>

          <div className="mt-3 flex justify-center">
            {paid ? (
              <Badge className="border-ok/40 bg-ok/10 text-ok">決済完了</Badge>
            ) : (
              <Badge className="border-warn/40 bg-warn/10 text-warn">決済を確認中</Badge>
            )}
          </div>

          <ul className="mt-5 space-y-1 text-left text-sm">
            {order.items.map((it, i) => (
              <li key={i} className="flex justify-between text-muted">
                <span className="truncate">
                  {it.name} × {it.qty}
                </span>
                <span className="tabular-nums">
                  {formatYen(taxInclusiveUnit(it.unitPrice, it.taxRate) * it.qty)}
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-4 space-y-1 border-t border-line pt-4 text-sm">
            <div className="flex justify-between text-muted">
              <span>商品合計（税込）</span>
              <span className="tabular-nums">
                {formatYen(order.subtotal + order.taxTotal)}
              </span>
            </div>
            {order.discountAmount > 0 && (
              <div className="flex justify-between text-ok">
                <span>
                  クーポン値引き
                  {order.couponCode && (
                    <span className="ml-1 font-mono text-xs">{order.couponCode}</span>
                  )}
                </span>
                <span className="tabular-nums">−{formatYen(order.discountAmount)}</span>
              </div>
            )}
            {order.shippingFee > 0 && (
              <div className="flex justify-between text-muted">
                <span>送料</span>
                <span className="tabular-nums">{formatYen(order.shippingFee)}</span>
              </div>
            )}
            {order.pointsUsed > 0 && (
              <div className="flex justify-between text-ok">
                <span>ポイント利用</span>
                <span className="tabular-nums">−{formatYen(order.pointsUsed)}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold text-ink">
              <span>お支払い合計</span>
              <span className="tabular-nums">{formatYen(order.total)}</span>
            </div>
          </div>

          <div className="mt-4 flex items-start gap-2 rounded-xl bg-base/60 p-3 text-left text-xs text-muted">
            {order.fulfillment === "pickup" ? (
              <StoreIcon size={16} className="mt-0.5 shrink-0 text-accent" />
            ) : (
              <TruckIcon size={16} className="mt-0.5 shrink-0 text-accent" />
            )}
            <p>
              <span className="font-medium text-ink">
                {FULFILLMENT_LABELS[order.fulfillment] ?? order.fulfillment}
              </span>
              <br />
              {order.fulfillment === "pickup"
                ? "次回ご来院時に受付で注文番号をお伝えください。ご用意ができ次第お渡しします。"
                : "ご入金確認後、順次発送いたします。発送状況はお電話にてお問い合わせください。"}
            </p>
          </div>

          {order.pointsEarned > 0 && (
            <div className="mt-3 flex items-center justify-center gap-2 rounded-xl border border-accent/30 bg-accent-soft/60 px-3 py-2 text-sm text-accent-fg">
              <CoinIcon size={16} className="text-accent" />
              {paid
                ? `${order.pointsEarned.toLocaleString("ja-JP")} ポイントを付与しました`
                : `決済確認後に ${order.pointsEarned.toLocaleString("ja-JP")} ポイントを付与します`}
            </div>
          )}

          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            {order.isMember && (
              <a
                href={`/shop/${slug}/member`}
                className="inline-flex h-10 items-center justify-center rounded-xl bg-accent px-5 text-sm font-semibold text-accent-fg hover:bg-accent-hover"
              >
                マイページでポイントを確認
              </a>
            )}
            <a
              href={`/shop/${slug}`}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-line px-5 text-sm text-ink hover:border-accent/60 hover:text-accent"
            >
              ストアに戻る
            </a>
          </div>
        </div>
      </div>
    </StoreShell>
  );
}
