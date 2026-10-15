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
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      {coupons.map((c) => {
        const conds: string[] = [];
        if (c.minSubtotal > 0) conds.push(`${formatYen(c.minSubtotal)}以上`);
        if (c.expiresAt) conds.push(`${dateFmt.format(new Date(c.expiresAt))}まで`);
        return (
          <div
            key={c.code}
            className="relative flex items-stretch overflow-hidden rounded-2xl border border-line bg-surface shadow-panel"
          >
            {/* 左: 値引き内容（チケットの半券） */}
            <div className="flex w-[6.5rem] shrink-0 flex-col items-center justify-center gap-1 bg-accent-soft px-2 py-3 text-accent-hover">
              <TicketIcon size={18} />
              <span className="text-center text-xs font-semibold leading-snug [word-break:auto-phrase]">
                {describeCoupon(c)}
              </span>
            </div>
            {/* 切り取り線 */}
            <div aria-hidden className="relative w-0 border-l border-dashed border-line">
              <span className="absolute -left-2 -top-2 h-4 w-4 rounded-full bg-base" />
              <span className="absolute -bottom-2 -left-2 h-4 w-4 rounded-full bg-base" />
            </div>
            <div className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="line-clamp-2 text-sm font-medium leading-snug text-ink">{c.name}</div>
                {conds.length > 0 && (
                  <div className="mt-0.5 text-[11px] text-faint">{conds.join("・")}</div>
                )}
              </div>
              <button
                type="button"
                onClick={() => copy(c.code)}
                className={
                  "flex shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 font-mono text-xs font-semibold tracking-wider transition-colors duration-300 " +
                  (copied === c.code
                    ? "border-ok/40 bg-ok/10 text-ok"
                    : "border-accent/40 text-accent-hover hover:bg-accent hover:text-accent-fg")
                }
                aria-label={`クーポンコード ${c.code} をコピー`}
              >
                {copied === c.code ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
                {copied === c.code ? "コピー済" : c.code}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
