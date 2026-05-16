"use client";

import * as React from "react";
import { cn } from "@/helper/utils/cn";

export function Modal({
  open,
  onClose,
  title,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
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
          "relative z-10 mt-6 w-full max-w-lg animate-fade-in rounded-xl border border-line bg-surface shadow-panel",
          className,
        )}
      >
        {title != null && (
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <h2 className="text-sm font-semibold tracking-wide text-ink">
              {title}
            </h2>
            <button
              onClick={onClose}
              aria-label="閉じる"
              className="text-muted transition-colors hover:text-ink"
            >
              ✕
            </button>
          </div>
        )}
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
