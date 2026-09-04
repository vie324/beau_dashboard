"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import {
  updateOrderStatus,
  cancelOrder,
} from "@/feature/order/actions/orderActions";
import type { OrderRow } from "@/feature/order/services/getOrders";
import {
  formatYen,
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  FULFILLMENT_LABELS,
} from "@/helper/utils/retail";

const dtFmt = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

const STATUS_OPTIONS = ["received", "preparing", "ready", "completed"] as const;

function payBadgeClass(s: string): string {
  if (s === "paid") return "border-ok/40 bg-ok/10 text-ok";
  if (s === "pending") return "border-warn/40 bg-warn/10 text-warn";
  return "border-line bg-elevated text-muted";
}

export function OrdersClient({
  orders,
  summary,
}: {
  orders: OrderRow[];
  summary: { todayTotal: number; monthTotal: number; allTotal: number; paidCount: number };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "open" | "paid">("all");
  const [expanded, setExpanded] = useState<number | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders.filter((o) => {
      if (filter === "open" && (o.status === "completed" || o.status === "cancelled"))
        return false;
      if (filter === "paid" && o.paymentStatus !== "paid") return false;
      if (!q) return true;
      return (
        o.orderNo.toLowerCase().includes(q) ||
        o.buyerName.toLowerCase().includes(q) ||
        (o.buyerPhone ?? "").includes(q) ||
        (o.customer?.name ?? "").toLowerCase().includes(q)
      );
    });
  }, [orders, query, filter]);

  function changeStatus(o: OrderRow, status: string) {
    startTransition(async () => {
      const res = await updateOrderStatus(o.id, status);
      if (!res.ok) alert(res.error);
      else router.refresh();
    });
  }

  function handleCancel(o: OrderRow) {
    if (
      !confirm(
        `注文 ${o.orderNo} をキャンセルしますか？\n（決済済みの場合は在庫を戻し、付与ポイントを取り消します。Stripeの返金は別途ダッシュボードで行ってください）`,
      )
    )
      return;
    startTransition(async () => {
      const res = await cancelOrder(o.id);
      if (!res.ok) alert(res.error);
      else router.refresh();
    });
  }

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "本日の売上", value: summary.todayTotal },
          { label: "今月の売上", value: summary.monthTotal },
          { label: "累計売上", value: summary.allTotal },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-line bg-surface p-3 shadow-panel"
          >
            <div className="text-xs text-faint">{s.label}</div>
            <div className="mt-0.5 text-lg font-semibold tabular-nums text-ink">
              {formatYen(s.value)}
            </div>
          </div>
        ))}
        <div className="rounded-xl border border-line bg-surface p-3 shadow-panel">
          <div className="text-xs text-faint">決済済み件数</div>
          <div className="mt-0.5 text-lg font-semibold tabular-nums text-ink">
            {summary.paidCount}
          </div>
        </div>
      </div>

      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="注文番号・購入者名・電話で検索"
          className="sm:max-w-sm"
        />
        <Select
          value={filter}
          onChange={(e) => setFilter(e.target.value as typeof filter)}
          className="sm:max-w-[12rem]"
        >
          <option value="all">すべて</option>
          <option value="open">対応中のみ</option>
          <option value="paid">決済済みのみ</option>
        </Select>
      </div>

      <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-panel">
        {filtered.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-faint">
            注文がありません。
          </p>
        ) : (
          <ul className="divide-y divide-line/70">
            {filtered.map((o) => {
              const isOpen = expanded === o.id;
              return (
                <li key={o.id} className="px-4 py-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <button
                      type="button"
                      onClick={() => setExpanded(isOpen ? null : o.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-mono text-sm font-medium text-ink">
                          {o.orderNo}
                        </span>
                        <Badge className={payBadgeClass(o.paymentStatus)}>
                          {PAYMENT_STATUS_LABELS[o.paymentStatus] ?? o.paymentStatus}
                        </Badge>
                        <Badge className="border-line bg-elevated text-muted">
                          {ORDER_STATUS_LABELS[o.status] ?? o.status}
                        </Badge>
                        <Badge className="border-info/40 bg-info/10 text-info">
                          {FULFILLMENT_LABELS[o.fulfillment] ?? o.fulfillment}
                        </Badge>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
                        <span className="font-medium text-ink">{o.buyerName}</span>
                        {o.customer && (
                          <span className="text-accent">
                            会員：{o.customer.name}
                          </span>
                        )}
                        {o.buyerPhone && <span>{o.buyerPhone}</span>}
                        <span>{o.items.length}点</span>
                        {o.pointsUsed > 0 && (
                          <span className="text-info">−{o.pointsUsed}pt利用</span>
                        )}
                        {o.discountAmount > 0 && (
                          <span className="text-info">
                            クーポン{o.couponCode ? ` ${o.couponCode}` : ""}
                          </span>
                        )}
                        {o.pointsEarned > 0 && (
                          <span>+{o.pointsEarned}pt</span>
                        )}
                        <span className="text-faint">
                          {dtFmt.format(o.createdAt)}
                        </span>
                      </div>
                    </button>
                    <div className="flex shrink-0 items-center gap-3 self-end sm:self-auto">
                      <span className="text-lg font-semibold tabular-nums text-ink">
                        {formatYen(o.total)}
                      </span>
                    </div>
                  </div>

                  {isOpen && (
                    <div className="mt-3 rounded-xl border border-line bg-base/60 p-3">
                      <ul className="mb-3 space-y-1 text-sm">
                        {o.items.map((it) => (
                          <li
                            key={it.id}
                            className="flex justify-between text-muted"
                          >
                            <span className="truncate">
                              {it.name} × {it.qty}
                            </span>
                            <span className="tabular-nums">
                              {formatYen(
                                Math.round(it.unitPrice * (1 + it.taxRate / 100)) *
                                  it.qty,
                              )}
                            </span>
                          </li>
                        ))}
                      </ul>
                      <div className="mb-3 space-y-0.5 text-xs text-muted">
                        <div className="flex justify-between">
                          <span>小計（税抜）</span>
                          <span className="tabular-nums">{formatYen(o.subtotal)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>消費税</span>
                          <span className="tabular-nums">{formatYen(o.taxTotal)}</span>
                        </div>
                        {o.discountAmount > 0 && (
                          <div className="flex justify-between text-ok">
                            <span>
                              クーポン値引き
                              {o.couponCode && (
                                <span className="ml-1 font-mono">{o.couponCode}</span>
                              )}
                            </span>
                            <span className="tabular-nums">
                              −{formatYen(o.discountAmount)}
                            </span>
                          </div>
                        )}
                        {o.shippingFee > 0 && (
                          <div className="flex justify-between">
                            <span>送料</span>
                            <span className="tabular-nums">
                              {formatYen(o.shippingFee)}
                            </span>
                          </div>
                        )}
                        {o.pointsUsed > 0 && (
                          <div className="flex justify-between text-ok">
                            <span>ポイント利用</span>
                            <span className="tabular-nums">
                              −{formatYen(o.pointsUsed)}
                            </span>
                          </div>
                        )}
                        <div className="flex justify-between font-semibold text-ink">
                          <span>合計</span>
                          <span className="tabular-nums">{formatYen(o.total)}</span>
                        </div>
                      </div>
                      {o.fulfillment === "shipping" && o.shippingAddress && (
                        <p className="mb-2 text-xs text-muted">
                          配送先：{o.shippingAddress}
                        </p>
                      )}
                      {o.note && (
                        <p className="mb-2 text-xs text-faint">備考：{o.note}</p>
                      )}
                      {o.status !== "cancelled" && (
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <Select
                            value={
                              STATUS_OPTIONS.includes(
                                o.status as (typeof STATUS_OPTIONS)[number],
                              )
                                ? o.status
                                : "received"
                            }
                            onChange={(e) => changeStatus(o, e.target.value)}
                            disabled={pending}
                            className="h-8 max-w-[10rem] text-xs"
                          >
                            {STATUS_OPTIONS.map((s) => (
                              <option key={s} value={s}>
                                {ORDER_STATUS_LABELS[s]}
                              </option>
                            ))}
                          </Select>
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => handleCancel(o)}
                            disabled={pending}
                          >
                            キャンセル
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
