"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/helper/utils/cn";

const LINKS = [
  { href: "/reservation", label: "予約管理" },
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
            {link.label}
            {active && (
              <span className="absolute inset-x-3 -bottom-[13px] h-0.5 rounded-full bg-accent" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
