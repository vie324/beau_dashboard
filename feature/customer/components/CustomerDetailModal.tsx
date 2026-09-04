"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input, Label } from "@/components/ui/Input";
import {
  fetchCustomerDetail,
  adjustCustomerPoints,
  type CustomerDetail,
} from "@/feature/customer/actions/pointActions";
import {
  formatYen,
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  POINT_TX_LABELS,
} from "@/helper/utils/retail";

const dtFmt = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

const REASON_PRESETS = [
  "来院ポイント",
  "店頭購入ポイント",
  "誕生日ボーナス",
  "紹介ありがとうポイント",
  "店頭でポイント利用",
  "訂正",
];

/**
 * 顧客のポイント台帳・購入履歴の閲覧と、手動でのポイント付与/減算。
 * 来院ポイントや店頭購入分をここから付与すると、お客様は販売ページの
 * マイページで残高を確認し、次回のオンライン購入で利用できる。
 */
export function CustomerDetailModal({
  open,
  onClose,
  customerId,
  customerName,
}: {
  open: boolean;
  onClose: () => void;
  customerId: number;
  customerName: string;
}) {
  const router = useRouter();
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"points" | "orders">("points");
  const [mode, setMode] = useState<"add" | "sub">("add");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function reload() {
    setLoading(true);
    const d = await fetchCustomerDetail(customerId);
    setDetail(d);
    setLoading(false);
  }

  useEffect(() => {
    if (open) void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, customerId]);

  function submit() {
    setError(null);
    setDone(null);
    const n = Math.floor(Number(amount));
    if (!Number.isFinite(n) || n <= 0) {
      setError("ポイント数を 1 以上で入力してください");
      return;
    }
    const signed = mode === "add" ? n : -n;
    startTransition(async () => {
      const res = await adjustCustomerPoints({
        customerId,
        points: signed,
        reason: reason.trim(),
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDone(
        mode === "add"
          ? `${n.toLocaleString("ja-JP")}pt を付与しました`
          : `${n.toLocaleString("ja-JP")}pt を減算しました`,
      );
      setAmount("");
      setReason("");
      await reload();
      router.refresh();
    });
  }

  const balance = detail?.customer.pointsBalance ?? 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`ポイント・購入履歴：${customerName}`}
      size="lg"
      footer={
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={onClose}>
            閉じる
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/30 bg-accent-soft/50 px-4 py-3">
          <div>
            <div className="text-xs text-muted">ポイント残高</div>
            <div className="text-2xl font-bold tabular-nums text-accent">
              {loading && !detail ? "…" : balance.toLocaleString("ja-JP")}
              <span className="ml-1 text-sm">pt</span>
            </div>
          </div>
          {detail?.customer.code && (
            <div className="text-right text-xs text-muted">
              会員番号
              <div className="font-mono text-sm text-ink">{detail.customer.code}</div>
            </div>
          )}
        </div>

        {/* 手動調整 */}
        <div className="rounded-xl border border-line bg-base/50 p-3">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-sm font-semibold text-ink">ポイントを手動で調整</span>
            <div className="ml-auto flex overflow-hidden rounded-lg border border-line text-xs">
              <button
                type="button"
                onClick={() => setMode("add")}
                className={
                  "px-3 py-1 font-medium " +
                  (mode === "add" ? "bg-ok/15 text-ok" : "text-muted hover:bg-elevated")
                }
              >
                ＋ 付与
              </button>
              <button
                type="button"
                onClick={() => setMode("sub")}
                className={
                  "border-l border-line px-3 py-1 font-medium " +
                  (mode === "sub" ? "bg-danger/10 text-danger" : "text-muted hover:bg-elevated")
                }
              >
                − 減算
              </button>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
            <div>
              <Label>ポイント数</Label>
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="100"
              />
            </div>
            <div>
              <Label>理由（必須）</Label>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="来院ポイント／店頭購入 など"
                maxLength={100}
              />
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {REASON_PRESETS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setReason(r)}
                className="rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] text-muted transition-colors hover:border-accent/50 hover:text-ink"
              >
                {r}
              </button>
            ))}
          </div>
          {error && (
            <p className="mt-2 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
              {error}
            </p>
          )}
          {done && (
            <p className="mt-2 rounded-xl border border-ok/30 bg-ok/10 px-3 py-2 text-xs text-ok">
              {done}
            </p>
          )}
          <div className="mt-3 flex justify-end">
            <Button size="sm" onClick={submit} disabled={pending}>
              {pending ? "更新中…" : mode === "add" ? "ポイントを付与" : "ポイントを減算"}
            </Button>
          </div>
        </div>

        {/* 履歴タブ */}
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <div className="flex border-b border-line">
            <TabButton active={tab === "points"} onClick={() => setTab("points")}>
              ポイント台帳{detail ? `（${detail.points.length}）` : ""}
            </TabButton>
            <TabButton active={tab === "orders"} onClick={() => setTab("orders")}>
              購入履歴{detail ? `（${detail.orders.length}）` : ""}
            </TabButton>
          </div>
          {!detail ? (
            <p className="py-8 text-center text-sm text-faint">読み込み中…</p>
          ) : tab === "points" ? (
            detail.points.length === 0 ? (
              <p className="py-8 text-center text-sm text-faint">ポイントの履歴はありません。</p>
            ) : (
              <ul className="max-h-72 divide-y divide-line/70 overflow-y-auto">
                {detail.points.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-ink">
                        {p.reason ?? POINT_TX_LABELS[p.type] ?? p.type}
                      </div>
                      <div className="text-xs text-faint">
                        {dtFmt.format(new Date(p.createdAt))}
                        <span className="ml-2">{POINT_TX_LABELS[p.type] ?? p.type}</span>
                        {p.orderNo && <span className="ml-2 font-mono">{p.orderNo}</span>}
                      </div>
                    </div>
                    <span
                      className={
                        "font-semibold tabular-nums " +
                        (p.points >= 0 ? "text-ok" : "text-danger")
                      }
                    >
                      {p.points >= 0 ? "+" : ""}
                      {p.points.toLocaleString("ja-JP")}
                    </span>
                  </li>
                ))}
              </ul>
            )
          ) : detail.orders.length === 0 ? (
            <p className="py-8 text-center text-sm text-faint">購入履歴はありません。</p>
          ) : (
            <ul className="max-h-72 divide-y divide-line/70 overflow-y-auto">
              {detail.orders.map((o) => (
                <li key={o.id} className="px-4 py-2.5 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-medium text-ink">{o.orderNo}</span>
                    <Badge
                      className={
                        o.paymentStatus === "paid"
                          ? "border-ok/40 bg-ok/10 text-ok"
                          : "border-line bg-elevated text-muted"
                      }
                    >
                      {PAYMENT_STATUS_LABELS[o.paymentStatus] ?? o.paymentStatus}
                    </Badge>
                    <Badge className="border-line bg-elevated text-muted">
                      {ORDER_STATUS_LABELS[o.status] ?? o.status}
                    </Badge>
                    <span className="ml-auto font-semibold tabular-nums text-ink">
                      {formatYen(o.total)}
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs text-muted">
                    {o.items.map((it) => `${it.name}×${it.qty}`).join("、")}
                  </div>
                  <div className="text-[11px] text-faint">
                    {dtFmt.format(new Date(o.createdAt))}
                    {o.pointsEarned > 0 && <span className="ml-2">+{o.pointsEarned}pt</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "relative flex-1 px-3 py-2.5 text-sm font-medium transition-colors " +
        (active ? "text-accent" : "text-muted hover:text-ink")
      }
    >
      {children}
      {active && <span className="absolute inset-x-4 bottom-0 h-0.5 rounded-full bg-accent" />}
    </button>
  );
}
