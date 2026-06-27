"use client";

import { useState } from "react";

/**
 * 星評価。display モード（小数対応・金色オーバーレイ）と input モード（クリック選択）。
 */
export function StarRating({
  value,
  size = 16,
  className = "",
}: {
  value: number;
  size?: number;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / 5) * 100));
  return (
    <span
      className={`relative inline-block leading-none ${className}`}
      style={{ fontSize: size }}
      aria-label={`5段階中${value.toFixed(1)}`}
    >
      <span className="text-line">★★★★★</span>
      <span
        className="absolute inset-0 overflow-hidden whitespace-nowrap text-accent"
        style={{ width: `${pct}%` }}
      >
        ★★★★★
      </span>
    </span>
  );
}

export function StarInput({
  value,
  onChange,
  size = 28,
}: {
  value: number;
  onChange: (v: number) => void;
  size?: number;
}) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div className="flex items-center gap-1" style={{ fontSize: size }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          className={
            "leading-none transition-transform hover:scale-110 " +
            (n <= shown ? "text-accent" : "text-line")
          }
          aria-label={`${n}つ星`}
        >
          ★
        </button>
      ))}
    </div>
  );
}
