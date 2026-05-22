"use client";

import { useEffect, useRef } from "react";
import { Badge } from "@/components/ui/Badge";
import { STATUS_OPTIONS, statusMeta } from "@/helper/utils/status";

/**
 * カードのステータスバッジから開く小さなメニュー。画面座標 (anchor) の
 * 近くに固定表示し、選択で onPick を呼ぶ。外側クリック / Esc で閉じる。
 */
export function StatusQuickMenu({
  anchor,
  current,
  onPick,
  onClose,
}: {
  anchor: { x: number; y: number };
  current: number;
  onPick: (status: number) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const vw = typeof window !== "undefined" ? window.innerWidth : 1024;
  const vh = typeof window !== "undefined" ? window.innerHeight : 768;
  const top = Math.max(8, Math.min(anchor.y, vh - 250));
  const left = Math.max(8, Math.min(anchor.x, vw - 184));

  return (
    <div
      ref={ref}
      className="fixed z-50 w-44 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-panel"
      style={{ top, left }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <p className="px-3 py-1 text-[10px] font-medium text-faint">
        ステータスを変更
      </p>
      {STATUS_OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => {
            onPick(o.value);
            onClose();
          }}
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-elevated"
        >
          <Badge className={statusMeta(o.value).className}>{o.label}</Badge>
          {o.value === current && (
            <span className="ml-auto text-xs text-accent">✓</span>
          )}
        </button>
      ))}
    </div>
  );
}
