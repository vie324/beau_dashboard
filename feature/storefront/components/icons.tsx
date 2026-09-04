// ストアフロント用の小さなインライン SVG アイコン集（外部アイコンライブラリ非依存）。
// すべて currentColor で描画するので、文字色クラスで色を変えられる。

import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 18, ...rest }: P) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    ...rest,
  };
}

export function CartIcon(p: P) {
  return (
    <svg {...base(p)}>
      <path d="M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h9.6a1 1 0 0 0 1-.8L21 8H7" />
      <circle cx="9.5" cy="20" r="1.2" />
      <circle cx="17.5" cy="20" r="1.2" />
    </svg>
  );
}

export function UserIcon(p: P) {
  return (
    <svg {...base(p)}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  );
}

export function SearchIcon(p: P) {
  return (
    <svg {...base(p)}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.2-4.2" />
    </svg>
  );
}

export function HeartIcon({ filled, ...p }: P & { filled?: boolean }) {
  return (
    <svg {...base(p)} fill={filled ? "currentColor" : "none"}>
      <path d="M12 20.5s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 8a4.3 4.3 0 0 1 7.5 2.5c0 5.4-7.5 10-7.5 10z" />
    </svg>
  );
}

export function CheckIcon(p: P) {
  return (
    <svg {...base(p)}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}

export function ShareIcon(p: P) {
  return (
    <svg {...base(p)}>
      <path d="M12 3v12" />
      <path d="m8 7 4-4 4 4" />
      <path d="M5 13v6a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-6" />
    </svg>
  );
}

export function ChevronLeftIcon(p: P) {
  return (
    <svg {...base(p)}>
      <path d="m15 5-7 7 7 7" />
    </svg>
  );
}

export function TicketIcon(p: P) {
  return (
    <svg {...base(p)}>
      <path d="M3 9V6.5A1.5 1.5 0 0 1 4.5 5h15A1.5 1.5 0 0 1 21 6.5V9a3 3 0 0 0 0 6v2.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5V15a3 3 0 0 0 0-6z" />
      <path d="M13 6v2M13 11v2M13 16v2" strokeDasharray="1 2.5" />
    </svg>
  );
}

export function TruckIcon(p: P) {
  return (
    <svg {...base(p)}>
      <path d="M3 7h11v9H3zM14 10h4l3 3v3h-7z" />
      <circle cx="7" cy="18" r="1.6" />
      <circle cx="17" cy="18" r="1.6" />
    </svg>
  );
}

export function StoreIcon(p: P) {
  return (
    <svg {...base(p)}>
      <path d="M4 10V20h16V10" />
      <path d="M3 6h18l-1 4a2.5 2.5 0 0 1-5 0 2.5 2.5 0 0 1-5 0 2.5 2.5 0 0 1-5 0L3 6z" />
      <path d="M10 20v-5h4v5" />
    </svg>
  );
}

export function SparkleIcon(p: P) {
  return (
    <svg {...base(p)}>
      <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
      <path d="M19 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" />
    </svg>
  );
}

export function CoinIcon(p: P) {
  return (
    <svg {...base(p)}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v9M9.5 9.8c0-1 1.1-1.8 2.5-1.8s2.5.8 2.5 1.8-1.1 1.7-2.5 2-2.5 1-2.5 2 1.1 1.8 2.5 1.8 2.5-.8 2.5-1.8" />
    </svg>
  );
}

export function ClockIcon(p: P) {
  return (
    <svg {...base(p)}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

export function CopyIcon(p: P) {
  return (
    <svg {...base(p)}>
      <rect x="9" y="9" width="11" height="11" rx="1.5" />
      <path d="M5 15V5a1 1 0 0 1 1-1h10" />
    </svg>
  );
}

export function XIcon(p: P) {
  return (
    <svg {...base(p)}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

export function TrophyIcon(p: P) {
  return (
    <svg {...base(p)}>
      <path d="M8 4h8v5a4 4 0 0 1-8 0z" />
      <path d="M8 6H5v1.5A3 3 0 0 0 8 10.5M16 6h3v1.5a3 3 0 0 1-3 3" />
      <path d="M12 13v3M9 20h6M10 16h4v4h-4z" />
    </svg>
  );
}
