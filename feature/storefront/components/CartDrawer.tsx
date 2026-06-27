"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { formatYen, taxInclusiveUnit } from "@/helper/utils/retail";
import type { StorefrontProduct } from "@/feature/storefront/services/getStorefront";

export type CartLineView = { productId: number; qty: number; product: StorefrontProduct };

export function CartDrawer({
  open,
  onClose,
  lines,
  subtotalIncl,
  subtotalExcl,
  freeShipRemaining,
  pointRatePercent,
  onSetQty,
  onCheckout,
}: {
  open: boolean;
  onClose: () => void;
  lines: CartLineView[];
  subtotalIncl: number;
  subtotalExcl: number;
  freeShipRemaining: number;
  pointRatePercent: number;
  onSetQty: (productId: number, qty: number) => void;
  onCheckout: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;
  const count = lines.reduce((s, l) => s + l.qty, 0);
  const earn = Math.floor((subtotalExcl * pointRatePercent) / 100);

  return (
    <div className="fixed inset-0 z-50">
      <button
        aria-label="閉じる"
        onClick={onClose}
        className="absolute inset-0 bg-black/40 animate-fade-in"
      />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-md animate-slide-in-right flex-col bg-base shadow-panel">
        <header className="flex items-center justify-between border-b border-line bg-surface px-5 py-4">
          <h2 className="text-sm font-semibold text-ink">
            カート（{count}点）
          </h2>
          <button
            onClick={onClose}
            aria-label="閉じる"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-elevated hover:text-ink"
          >
            ✕
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {lines.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <span className="text-4xl">🛒</span>
              <p className="text-sm text-muted">カートは空です</p>
              <Button variant="outline" size="sm" onClick={onClose}>
                買い物を続ける
              </Button>
            </div>
          ) : (
            <ul className="space-y-3">
              {lines.map((l) => {
                const img = parseFirstImage(l.product.imageUrls);
                return (
                  <li
                    key={l.productId}
                    className="flex gap-3 rounded-xl border border-line bg-surface p-3"
                  >
                    <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-elevated">
                      {img ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={img} alt={l.product.name} className="h-full w-full object-cover" />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-ink">
                        {l.product.name}
                      </div>
                      <div className="text-xs text-muted tabular-nums">
                        {formatYen(taxInclusiveUnit(l.product.price, l.product.taxRate))}
                      </div>
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <StepButton
                          label="−"
                          onClick={() => onSetQty(l.productId, l.qty - 1)}
                        />
                        <span className="w-7 text-center text-sm tabular-nums">
                          {l.qty}
                        </span>
                        <StepButton
                          label="＋"
                          disabled={l.qty >= l.product.stock}
                          onClick={() => onSetQty(l.productId, l.qty + 1)}
                        />
                        <button
                          onClick={() => onSetQty(l.productId, 0)}
                          className="ml-auto text-xs text-faint hover:text-danger"
                        >
                          削除
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {lines.length > 0 && (
          <footer className="space-y-3 border-t border-line bg-surface px-5 py-4">
            {freeShipRemaining > 0 ? (
              <div className="space-y-1">
                <p className="text-center text-xs text-accent-fg">
                  あと <span className="font-semibold">{formatYen(freeShipRemaining)}</span> で配送料無料
                </p>
                <div className="h-1.5 overflow-hidden rounded-full bg-elevated">
                  <div
                    className="h-full rounded-full bg-accent transition-all"
                    style={{
                      width: `${Math.min(100, (subtotalIncl / (subtotalIncl + freeShipRemaining)) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            ) : (
              <p className="rounded-lg bg-ok/10 px-3 py-1.5 text-center text-xs font-medium text-ok">
                配送料無料の対象です
              </p>
            )}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted">小計（税込）</span>
              <span className="text-xl font-bold tabular-nums text-ink">
                {formatYen(subtotalIncl)}
              </span>
            </div>
            {earn > 0 && (
              <p className="text-right text-xs text-accent">
                ご購入で約 {earn} ポイント付与
              </p>
            )}
            <Button className="w-full transition-transform active:scale-[0.98]" onClick={onCheckout}>
              購入手続きへ進む
            </Button>
          </footer>
        )}
      </aside>
    </div>
  );
}

function StepButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex h-7 w-7 items-center justify-center rounded-lg border border-line text-muted transition-colors hover:bg-elevated disabled:opacity-40"
    >
      {label}
    </button>
  );
}

function parseFirstImage(raw: string | null): string | undefined {
  if (!raw) return undefined;
  try {
    const v = JSON.parse(raw);
    if (Array.isArray(v) && typeof v[0] === "string") return v[0];
  } catch {
    /* ignore */
  }
  return undefined;
}
