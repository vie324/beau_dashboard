"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { PriceTag } from "@/feature/storefront/components/PriceTag";
import { XIcon, CartIcon } from "@/feature/storefront/components/icons";
import {
  formatYen,
  taxInclusiveUnit,
  parseImageUrls,
} from "@/helper/utils/retail";
import type { StorefrontProduct } from "@/feature/storefront/services/getStorefront";

export type CartLineView = {
  productId: number;
  qty: number;
  product: StorefrontProduct;
};

export function CartDrawer({
  open,
  onClose,
  slug,
  lines,
  subtotalIncl,
  subtotalExcl,
  freeShipRemaining,
  pointRatePercent,
  suggestions,
  onSetQty,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  slug: string;
  lines: CartLineView[];
  subtotalIncl: number;
  subtotalExcl: number;
  freeShipRemaining: number;
  pointRatePercent: number;
  /** 「あわせて買いたい」に出す商品（カート未投入・在庫あり）。 */
  suggestions: StorefrontProduct[];
  onSetQty: (productId: number, qty: number) => void;
  onAdd: (productId: number) => boolean | void;
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
        className="absolute inset-0 animate-fade-in bg-black/40"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="カート"
        className="absolute right-0 top-0 flex h-full w-full max-w-md animate-slide-in-right flex-col bg-base shadow-panel"
      >
        <header className="flex items-center justify-between border-b border-line bg-surface px-5 py-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
            <CartIcon size={18} className="text-accent" />
            カート
            <span className="text-xs font-normal text-muted">（{count}点）</span>
          </h2>
          <button
            onClick={onClose}
            aria-label="閉じる"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-elevated hover:text-ink"
          >
            <XIcon size={18} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {lines.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-elevated text-faint">
                <CartIcon size={28} />
              </span>
              <p className="text-sm text-muted">カートは空です</p>
              <Button variant="outline" size="sm" onClick={onClose}>
                買い物を続ける
              </Button>
            </div>
          ) : (
            <ul className="space-y-3">
              {lines.map((l) => {
                const img = parseImageUrls(l.product.imageUrls)[0];
                const unit = taxInclusiveUnit(l.product.price, l.product.taxRate);
                return (
                  <li
                    key={l.productId}
                    className="flex gap-3 rounded-xl border border-line bg-surface p-3"
                  >
                    <a
                      href={`/shop/${slug}/item/${l.productId}`}
                      className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-elevated"
                    >
                      {img ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={img}
                          alt={l.product.name}
                          className="h-full w-full object-cover"
                        />
                      ) : null}
                    </a>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-ink">
                        {l.product.name}
                      </div>
                      <PriceTag
                        size="sm"
                        price={l.product.price}
                        compareAtPrice={l.product.compareAtPrice}
                        taxRate={l.product.taxRate}
                      />
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <StepButton
                          label="−"
                          ariaLabel="数量を減らす"
                          onClick={() => onSetQty(l.productId, l.qty - 1)}
                        />
                        <span className="w-7 text-center text-sm tabular-nums">
                          {l.qty}
                        </span>
                        <StepButton
                          label="＋"
                          ariaLabel="数量を増やす"
                          disabled={l.qty >= l.product.stock}
                          onClick={() => onSetQty(l.productId, l.qty + 1)}
                        />
                        <span className="ml-auto text-sm font-semibold tabular-nums text-ink">
                          {formatYen(unit * l.qty)}
                        </span>
                      </div>
                      <button
                        onClick={() => onSetQty(l.productId, 0)}
                        className="mt-1 text-xs text-faint hover:text-danger"
                      >
                        削除
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {lines.length > 0 && suggestions.length > 0 && (
            <section className="mt-6">
              <h3 className="mb-2 text-xs font-semibold tracking-wider text-muted">
                あわせて買いたい
              </h3>
              <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
                {suggestions.map((p) => {
                  const img = parseImageUrls(p.imageUrls)[0];
                  return (
                    <div
                      key={p.id}
                      className="w-32 shrink-0 rounded-xl border border-line bg-surface p-2"
                    >
                      <a
                        href={`/shop/${slug}/item/${p.id}`}
                        className="block aspect-square overflow-hidden rounded-lg bg-elevated"
                      >
                        {img ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={img} alt={p.name} className="h-full w-full object-cover" />
                        ) : null}
                      </a>
                      <div className="mt-1 line-clamp-2 text-[11px] leading-snug text-ink">
                        {p.name}
                      </div>
                      <div className="text-xs font-semibold tabular-nums text-ink">
                        {formatYen(taxInclusiveUnit(p.price, p.taxRate))}
                      </div>
                      <button
                        type="button"
                        onClick={() => onAdd(p.id)}
                        className="mt-1 h-7 w-full rounded-lg border border-accent/40 bg-accent-soft text-[11px] font-semibold text-accent-fg transition-colors hover:bg-accent hover:text-accent-fg"
                      >
                        ＋ 追加
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>

        {lines.length > 0 && (
          <footer className="space-y-3 border-t border-line bg-surface px-5 py-4">
            {freeShipRemaining > 0 ? (
              <div className="space-y-1">
                <p className="text-center text-xs text-accent-fg">
                  あと{" "}
                  <span className="font-semibold">{formatYen(freeShipRemaining)}</span>{" "}
                  で配送料無料
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
                配送料無料の対象です（店頭受取も送料無料）
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
                ご購入で約 {earn.toLocaleString("ja-JP")} ポイント付与
              </p>
            )}
            <a
              href={`/shop/${slug}/checkout`}
              className="flex h-11 w-full items-center justify-center rounded-xl bg-accent text-sm font-semibold text-accent-fg transition-transform hover:bg-accent-hover active:scale-[0.98]"
            >
              ご購入手続きへ
            </a>
            <button
              onClick={onClose}
              className="w-full text-center text-xs text-muted hover:text-ink"
            >
              お買い物を続ける
            </button>
          </footer>
        )}
      </aside>
    </div>
  );
}

function StepButton({
  label,
  ariaLabel,
  onClick,
  disabled,
}: {
  label: string;
  ariaLabel: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className="flex h-7 w-7 items-center justify-center rounded-lg border border-line text-muted transition-colors hover:bg-elevated disabled:opacity-40"
    >
      {label}
    </button>
  );
}
