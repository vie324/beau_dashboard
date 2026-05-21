"use client";

import Link from "next/link";
import { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/helper/utils/cn";

const LINKS = [
  { href: "/reservation", label: "予約管理" },
  { href: "/customers", label: "顧客" },
  { href: "/booking-links", label: "予約リンク" },
  { href: "/settings", label: "設定" },
  { href: "/help", label: "ヘルプ" },
];

export function TopNav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1">
      {LINKS.map((link) => {
        const active =
          pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "relative rounded-xl px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "text-accent"
                : "text-muted hover:text-ink hover:bg-elevated",
            )}
          >
            <NavInner label={link.label} active={active} />
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Link 子コンポーネント。useLinkStatus はリンク子要素でのみ動作するため
 * 内部コンポーネントに分離している。読み込み中はスピナー＋下線パルスを表示。
 */
function NavInner({ label, active }: { label: string; active: boolean }) {
  const { pending } = useLinkStatus();
  return (
    <>
      <span className="inline-flex items-center gap-1.5">
        <span>{label}</span>
        {pending && (
          <span
            aria-hidden
            className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-line border-t-accent"
          />
        )}
      </span>
      {active && !pending && (
        <span className="absolute inset-x-3 -bottom-[13px] h-0.5 rounded-full bg-accent" />
      )}
      {pending && (
        <span className="absolute inset-x-3 -bottom-[13px] h-0.5 animate-pulse rounded-full bg-accent/60" />
      )}
    </>
  );
}
