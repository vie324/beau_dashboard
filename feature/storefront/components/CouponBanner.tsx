"use client";

import { useEffect, useRef, useState } from "react";
import type { PublicCoupon } from "@/feature/coupon/services/getCoupons";
import { describeCoupon, formatYen } from "@/helper/utils/retail";
import { TicketIcon, CopyIcon, CheckIcon } from "@/feature/storefront/components/icons";

const dateFmt = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  month: "numeric",
  day: "numeric",
});

/** 販売ページに掲示する公開クーポン。コードをワンタップでコピーできる。 */
export function CouponBanner({ coupons }: { coupons: PublicCoupon[] }) {
  const [copied, setCopied] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );
  if (coupons.length === 0) return null;

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      /* clipboard 不可の環境ではコード表示だけで十分 */
    }
    setCopied(code);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(null), 1600);
  }

  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-2">
      {coupons.map((c) => {
        const conds: string[] = [];
        if (c.minSubtotal > 0) conds.push(`${formatYen(c.minSubtotal)}以上`);
        if (c.expiresAt) conds.push(`${dateFmt.format(new Date(c.expiresAt))}まで`);
        return (
          <div
            key={c.code}
            className="flex items-center gap-3 rounded-2xl border border-dashed border-accent/60 bg-surface px-4 py-3"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
              <TicketIcon size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-ink">
                {c.name}
              </div>
              <div className="text-xs text-muted">
                {describeCoupon(c)}
                {conds.length > 0 && (
                  <span className="text-faint">・{conds.join("・")}</span>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => copy(c.code)}
              className={
                "flex shrink-0 items-center gap-1 rounded-lg border px-2.5 py-1.5 font-mono text-xs font-semibold tracking-wider transition-colors " +
                (copied === c.code
                  ? "border-ok/40 bg-ok/10 text-ok"
                  : "border-accent/40 bg-accent-soft text-accent-fg hover:border-accent")
              }
              aria-label={`クーポンコード ${c.code} をコピー`}
            >
              {copied === c.code ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
              {copied === c.code ? "コピー済" : c.code}
            </button>
          </div>
        );
      })}
    </div>
  );
}
