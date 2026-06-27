import { getOrderForComplete } from "@/feature/storefront/services/getOrderForComplete";
import { StoreUnavailable } from "@/feature/storefront/components/StoreUnavailable";
import { Badge } from "@/components/ui/Badge";
import {
  formatYen,
  taxInclusiveUnit,
  FULFILLMENT_LABELS,
} from "@/helper/utils/retail";

export const dynamic = "force-dynamic";

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
    <main className="min-h-screen px-4 py-10">
      <div className="mx-auto max-w-md">
        <div className="rounded-xl border border-line bg-surface p-6 text-center shadow-panel">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-ok/15 text-2xl text-ok">
            ✓
          </div>
          <h1 className="mt-4 text-lg font-semibold text-ink">
            ご注文ありがとうございます
          </h1>
          <p className="mt-1 font-mono text-sm text-muted">{order.orderNo}</p>

          <div className="mt-3 flex justify-center">
            {paid ? (
              <Badge className="border-ok/40 bg-ok/10 text-ok">決済完了</Badge>
            ) : (
              <Badge className="border-warn/40 bg-warn/10 text-warn">
                決済を確認中
              </Badge>
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
              <span>小計（税抜）</span>
              <span className="tabular-nums">{formatYen(order.subtotal)}</span>
            </div>
            <div className="flex justify-between text-muted">
              <span>消費税</span>
              <span className="tabular-nums">{formatYen(order.taxTotal)}</span>
            </div>
            {order.shippingFee > 0 && (
              <div className="flex justify-between text-muted">
                <span>送料</span>
                <span className="tabular-nums">{formatYen(order.shippingFee)}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold text-ink">
              <span>合計</span>
              <span className="tabular-nums">{formatYen(order.total)}</span>
            </div>
          </div>

          <p className="mt-4 text-sm text-muted">
            受け取り方法：
            {FULFILLMENT_LABELS[order.fulfillment] ?? order.fulfillment}
          </p>
          {order.pointsEarned > 0 && (
            <p className="mt-1 text-sm text-accent">
              {order.pointsEarned} ポイントを付与しました
            </p>
          )}

          <a
            href={`/shop/${slug}`}
            className="mt-6 inline-block text-sm text-accent hover:underline"
          >
            ストアに戻る
          </a>
        </div>
        <p className="mt-4 text-center text-xs text-faint">{shop.name}</p>
      </div>
    </main>
  );
}
