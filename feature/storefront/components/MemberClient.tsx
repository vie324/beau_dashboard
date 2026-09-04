"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { MemberVerifyForm } from "@/feature/storefront/components/MemberVerifyForm";
import {
  getMemberSummary,
  type MemberOrderRow,
  type MemberPointRow,
  type MemberProfile,
} from "@/feature/storefront/actions/memberActions";
import {
  readMemberSession,
  writeMemberSession,
  clearMemberSession,
} from "@/feature/storefront/lib/memberSession";
import {
  CoinIcon,
  SparkleIcon,
  UserIcon,
} from "@/feature/storefront/components/icons";
import {
  formatYen,
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  FULFILLMENT_LABELS,
  POINT_TX_LABELS,
} from "@/helper/utils/retail";

const dtFmt = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

type Summary = {
  member: MemberProfile;
  points: MemberPointRow[];
  orders: MemberOrderRow[];
};

export function MemberClient({
  slug,
  pointRatePercent,
  allowPointRedeem,
}: {
  slug: string;
  pointRatePercent: number;
  allowPointRedeem: boolean;
}) {
  // undefined = 判定前（SSR/初回描画）, null = 未確認
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"points" | "orders">("points");

  const load = useCallback(
    async (t: string) => {
      setLoading(true);
      const res = await getMemberSummary({ slug, token: t });
      setLoading(false);
      if (!res.ok) {
        clearMemberSession(slug);
        setToken(null);
        setSummary(null);
        setNotice(res.error);
        return;
      }
      setSummary({ member: res.member, points: res.points, orders: res.orders });
      writeMemberSession(slug, {
        token: t,
        name: res.member.name,
        pointsBalance: res.member.pointsBalance,
      });
    },
    [slug],
  );

  useEffect(() => {
    const s = readMemberSession(slug);
    setToken(s?.token ?? null);
    if (s?.token) void load(s.token);
  }, [slug, load]);

  function logout() {
    clearMemberSession(slug);
    setToken(null);
    setSummary(null);
    setNotice("ログアウトしました");
  }

  if (token === undefined) {
    return <div className="h-40 animate-pulse rounded-2xl bg-elevated" />;
  }

  if (!token) {
    return (
      <div className="space-y-5">
        {notice && (
          <p className="rounded-xl border border-info/30 bg-info/10 px-3 py-2 text-sm text-info">
            {notice}
          </p>
        )}
        <section className="rounded-3xl border border-line bg-surface p-6 shadow-panel sm:p-8">
          <p className="text-[11px] uppercase tracking-[0.35em] text-faint">Member</p>
          <h1 className="mt-1 font-display text-2xl tracking-wide text-ink">
            マイページ
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            ご来院時の会員番号（診察券番号）で、ポイント残高とご注文履歴をご確認いただけます。
          </p>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {pointRatePercent > 0 && (
              <li className="flex items-center gap-2 rounded-xl bg-accent-soft/60 px-3 py-2 text-xs text-accent-fg">
                <CoinIcon size={16} className="text-accent" />
                お買い物で{pointRatePercent}%のポイントが貯まります
              </li>
            )}
            <li className="flex items-center gap-2 rounded-xl bg-accent-soft/60 px-3 py-2 text-xs text-accent-fg">
              <SparkleIcon size={16} className="text-accent" />
              {allowPointRedeem
                ? "貯まったポイントは 1pt=1円 でお支払いに使えます"
                : "貯まったポイントは店頭でご利用いただけます"}
            </li>
          </ul>
          <div className="mt-6">
            <MemberVerifyForm
              slug={slug}
              onVerified={({ token: t }) => {
                setNotice(null);
                setToken(t);
                void load(t);
              }}
            />
          </div>
        </section>
      </div>
    );
  }

  if (!summary) {
    return <div className="h-40 animate-pulse rounded-2xl bg-elevated" />;
  }

  const m = summary.member;

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-3xl border border-line bg-surface shadow-panel">
        <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent">
              <UserIcon size={22} />
            </span>
            <div>
              <p className="text-[11px] uppercase tracking-[0.3em] text-faint">
                Welcome
              </p>
              <h1 className="text-lg font-semibold text-ink">{m.name} 様</h1>
              {m.code && (
                <p className="text-xs tabular-nums text-muted">会員番号 {m.code}</p>
              )}
            </div>
          </div>
          <div className="rounded-2xl border border-accent/30 bg-accent-soft/60 px-5 py-3 text-right">
            <p className="text-[11px] text-muted">ご利用可能ポイント</p>
            <p className="text-3xl font-bold tabular-nums text-accent">
              {m.pointsBalance.toLocaleString("ja-JP")}
              <span className="ml-1 text-sm font-semibold">pt</span>
            </p>
            <p className="text-[11px] text-muted">
              {allowPointRedeem
                ? "1pt = 1円としてお買い物にご利用いただけます"
                : "店頭でご利用いただけます"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-line bg-base/50 px-6 py-3 sm:px-8">
          <a
            href={`/shop/${slug}`}
            className="inline-flex h-9 items-center rounded-xl bg-accent px-4 text-xs font-semibold text-accent-fg hover:bg-accent-hover"
          >
            お買い物をする
          </a>
          <Button size="sm" variant="ghost" onClick={() => void load(token)} disabled={loading}>
            {loading ? "更新中…" : "最新の情報に更新"}
          </Button>
          <button
            onClick={logout}
            className="ml-auto text-xs text-muted hover:text-danger"
          >
            ログアウト
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-surface shadow-panel">
        <div className="flex border-b border-line">
          <TabButton active={tab === "points"} onClick={() => setTab("points")}>
            ポイント履歴
          </TabButton>
          <TabButton active={tab === "orders"} onClick={() => setTab("orders")}>
            ご注文履歴
          </TabButton>
        </div>

        {tab === "points" ? (
          summary.points.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-faint">
              ポイントの履歴はまだありません。
            </p>
          ) : (
            <ul className="divide-y divide-line/70">
              {summary.points.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-ink">
                      {p.reason ?? POINT_TX_LABELS[p.type] ?? p.type}
                    </div>
                    <div className="text-xs text-faint">
                      {dtFmt.format(new Date(p.createdAt))}
                      <span className="ml-2">{POINT_TX_LABELS[p.type] ?? p.type}</span>
                    </div>
                  </div>
                  <span
                    className={
                      "text-sm font-semibold tabular-nums " +
                      (p.points >= 0 ? "text-ok" : "text-danger")
                    }
                  >
                    {p.points >= 0 ? "+" : ""}
                    {p.points.toLocaleString("ja-JP")}pt
                  </span>
                </li>
              ))}
            </ul>
          )
        ) : summary.orders.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-faint">
            ご注文履歴はまだありません。
          </p>
        ) : (
          <ul className="divide-y divide-line/70">
            {summary.orders.map((o) => (
              <li key={o.id} className="px-5 py-3">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-mono text-sm font-medium text-ink">
                    {o.orderNo}
                  </span>
                  <Badge
                    className={
                      o.paymentStatus === "paid"
                        ? "border-ok/40 bg-ok/10 text-ok"
                        : o.paymentStatus === "pending"
                          ? "border-warn/40 bg-warn/10 text-warn"
                          : "border-line bg-elevated text-muted"
                    }
                  >
                    {PAYMENT_STATUS_LABELS[o.paymentStatus] ?? o.paymentStatus}
                  </Badge>
                  <Badge className="border-line bg-elevated text-muted">
                    {ORDER_STATUS_LABELS[o.status] ?? o.status}
                  </Badge>
                  <Badge className="border-info/40 bg-info/10 text-info">
                    {FULFILLMENT_LABELS[o.fulfillment] ?? o.fulfillment}
                  </Badge>
                  <span className="ml-auto text-sm font-semibold tabular-nums text-ink">
                    {formatYen(o.total)}
                  </span>
                </div>
                <div className="mt-1 text-xs text-muted">
                  {o.items.map((it) => `${it.name}×${it.qty}`).join("、")}
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-faint">
                  <span>{dtFmt.format(new Date(o.createdAt))}</span>
                  {o.discountAmount > 0 && (
                    <span>クーポン −{formatYen(o.discountAmount)}</span>
                  )}
                  {o.pointsUsed > 0 && <span>ポイント利用 {o.pointsUsed}pt</span>}
                  {o.pointsEarned > 0 && o.paymentStatus === "paid" && (
                    <span className="text-accent">+{o.pointsEarned}pt</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
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
        "relative flex-1 px-4 py-3 text-sm font-medium transition-colors " +
        (active ? "text-accent" : "text-muted hover:text-ink")
      }
    >
      {children}
      {active && (
        <span className="absolute inset-x-6 bottom-0 h-0.5 rounded-full bg-accent" />
      )}
    </button>
  );
}
