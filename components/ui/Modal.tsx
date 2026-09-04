"use client";

import * as React from "react";
import { cn } from "@/helper/utils/cn";

const SIZE: Record<"md" | "lg" | "xl", string> = {
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  className,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  /** 指定すると下部に sticky なアクションバーとして表示する（保存/キャンセル等）。
      スマホで縦長フォームでも一番下までスクロールせずにボタンを押せる。 */
  footer?: React.ReactNode;
  className?: string;
  /** 横幅。一覧や台帳を出すモーダルは lg。className で max-w を上書きしても
      CSS の出力順で負けることがあるため、幅はこの prop で指定する。 */
  size?: "md" | "lg" | "xl";
}) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 sm:p-8">
      {/* Backdrop is non-interactive: prevents accidental data loss from a
          stray click. Close via the ✕ button, Cancel, or Escape. */}
      <div className="absolute inset-0" aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "relative z-10 my-6 w-full animate-fade-in rounded-xl border border-line bg-surface shadow-panel",
          SIZE[size],
          className,
        )}
      >
        {title != null && (
          // ヘッダーは sticky: 縦長モーダルをスクロールしてもタイトルと✕が残る。
          <div className="sticky top-0 z-20 flex items-center justify-between rounded-t-xl border-b border-line bg-surface px-5 py-4">
            <h2 className="text-sm font-semibold tracking-wide text-ink">
              {title}
            </h2>
            <button
              onClick={onClose}
              aria-label="閉じる"
              className="-mr-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-elevated hover:text-ink"
            >
              ✕
            </button>
          </div>
        )}
        <div className="p-5">{children}</div>
        {footer != null && (
          <div className="sticky bottom-0 z-20 rounded-b-xl border-t border-line bg-surface px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
