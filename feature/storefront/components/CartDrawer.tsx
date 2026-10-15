"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { PriceTag } from "@/feature/storefront/components/PriceTag";
import { ProductImagePlaceholder } from "@/feature/storefront/components/ProductImagePlaceholder";
import {
  XIcon,
  CartIcon,
  TruckIcon,
  PlusIcon,
  MinusIcon,
  CheckIcon,
} from "@/feature/storefront/components/icons";
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
  const shipProgress =
    freeShipRemaining > 0
      ? Math.min(100, (subtotalIncl / (subtotalIncl + freeShipRemaining)) * 100)
      : 100;

  return (
    <div className="fixed inset-0 z-50">
      <button
        aria-label="閉じる"
        onClick={onClose}
        className="absolute inset-0 animate-fade-in bg-ink/40 backdrop-blur-[2px]"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="カート"
        className="absolute right-0 top-0 flex h-full w-full max-w-md animate-slide-in-right flex-col bg-base shadow-[-30px_0_60px_-30px_rgba(45,51,41,0.45)] sm:rounded-l-[2rem]"
      >
        <header className="flex items-center justify-between px-6 pb-4 pt-6">
          <div>
            <p className="font-accent text-sm italic tracking-[0.28em] text-accent">Your Cart</p>
            <h2 className="mt-0.5 font-display text-xl font-semibold tracking-[0.1em] text-ink">
              カート
              <span className="ml-2 font-sans text-xs font-normal tracking-normal text-muted">
                {count}点
              </span>
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="閉じる"
            className="flex h-10 w-10 items-center justify-center rounded-full text-muted transition-all duration-300 hover:rotate-90 hover:bg-elevated hover:text-ink"
          >
            <XIcon size={18} />
          </button>
        </header>

        {lines.length > 0 && (
          <div className="mx-6 mb-2 rounded-2xl bg-surface px-4 py-3">
            {freeShipRemaining > 0 ? (
              <p className="text-center text-xs text-muted">
                あと
                <span className="mx-1 font-semibold text-clay">{formatYen(freeShipRemaining)}</span>
                で配送料無料
              </p>
            ) : (
              <p className="flex items-center justify-center gap-1 text-center text-xs font-medium text-ok">
                <CheckIcon size={14} />
                配送料無料の対象です（店頭受取も送料無料）
              </p>
            )}
            <div className="relative mt-3 h-1.5 rounded-full bg-elevated">
              <div
                className={
                  "h-full rounded-full transition-[width] duration-700 ease-silk " +
                  (freeShipRemaining > 0 ? "bg-clay" : "bg-ok")
                }
                style={{ width: `${shipProgress}%` }}
              />
              <span
                className={
                  "absolute top-1/2 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border bg-surface transition-[left] duration-700 ease-silk " +
                  (freeShipRemaining > 0 ? "border-clay/40 text-clay" : "border-ok/40 text-ok")
                }
                style={{ left: `${Math.max(6, Math.min(94, shipProgress))}%` }}
              >
                <TruckIcon size={12} />
              </span>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-6 py-3">
          {lines.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
              <span className="flex h-20 w-20 items-center justify-center rounded-full bg-accent-soft text-accent">
                <CartIcon size={30} />
              </span>
              <p className="text-sm text-muted">カートは空です</p>
              <Button variant="outline" size="sm" className="rounded-full px-5" onClick={onClose}>
                お買い物を続ける
              </Button>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {lines.map((l) => {
                const img = parseImageUrls(l.product.imageUrls)[0];
                const unit = taxInclusiveUnit(l.product.price, l.product.taxRate);
                return (
                  <li key={l.productId} className="flex gap-4 py-4 first:pt-1">
                    <a
                      href={`/shop/${slug}/item/${l.productId}`}
                      className="aspect-[4/5] w-20 shrink-0 overflow-hidden rounded-2xl bg-elevated"
                    >
                      {img ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={img}
                          alt={l.product.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <ProductImagePlaceholder name={l.product.name} size="sm" />
                      )}
                    </a>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <div className="flex items-start justify-between gap-2">
                        <div className="line-clamp-2 text-sm font-medium leading-snug text-ink">
                          {l.product.name}
                        </div>
                        <button
                          onClick={() => onSetQty(l.productId, 0)}
                          aria-label={`${l.product.name}を削除`}
                          className="-mr-1 -mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-faint transition-colors hover:bg-danger/10 hover:text-danger"
                        >
                          <XIcon size={14} />
                        </button>
                      </div>
                      <PriceTag
                        size="sm"
                        className="mt-0.5"
                        price={l.product.price}
                        compareAtPrice={l.product.compareAtPrice}
                        taxRate={l.product.taxRate}
                      />
                      <div className="mt-auto flex items-center justify-between pt-2">
                        <div className="flex h-9 items-center rounded-full border border-line bg-surface">
                          <StepButton
                            ariaLabel="数量を減らす"
                            onClick={() => onSetQty(l.productId, l.qty - 1)}
                          >
                            <MinusIcon size={13} />
                          </StepButton>
                          <span className="w-6 text-center text-sm tabular-nums">{l.qty}</span>
                          <StepButton
                            ariaLabel="数量を増やす"
                            disabled={l.qty >= l.product.stock}
                            onClick={() => onSetQty(l.productId, l.qty + 1)}
                          >
                            <PlusIcon size={13} />
                          </StepButton>
                        </div>
                        <span className="text-sm font-semibold tabular-nums text-ink">
                          {formatYen(unit * l.qty)}
                        </span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {lines.length > 0 && suggestions.length > 0 && (
            <section className="mt-6 border-t border-line pt-5">
              <h3 className="font-accent text-sm italic tracking-[0.25em] text-accent">
                Pairs well with
              </h3>
              <p className="mb-3 text-xs text-muted">あわせて買いたい</p>
              <div className="no-scrollbar -mx-6 flex gap-3 overflow-x-auto px-6 pb-1">
                {suggestions.map((p) => {
                  const img = parseImageUrls(p.imageUrls)[0];
                  return (
                    <div key={p.id} className="w-28 shrink-0">
                      <a
                        href={`/shop/${slug}/item/${p.id}`}
                        className="block aspect-[4/5] overflow-hidden rounded-2xl bg-elevated"
                      >
                        {img ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={img} alt={p.name} className="h-full w-full object-cover" />
                        ) : (
                          <ProductImagePlaceholder name={p.name} size="sm" />
                        )}
                      </a>
                      <div className="mt-1.5 line-clamp-2 text-[11px] leading-snug text-ink">
                        {p.name}
                      </div>
                      <div className="text-xs font-semibold tabular-nums text-ink">
                        {formatYen(taxInclusiveUnit(p.price, p.taxRate))}
                      </div>
                      <button
                        type="button"
                        onClick={() => onAdd(p.id)}
                        className="mt-1.5 flex h-8 w-full items-center justify-center gap-1 rounded-full border border-accent/40 text-[11px] font-semibold text-accent-hover transition-colors hover:bg-accent hover:text-accent-fg"
                      >
                        <PlusIcon size={12} />
                        追加
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>

        {lines.length > 0 && (
          <footer
            className="space-y-3 border-t border-line bg-surface px-6 py-5 sm:rounded-bl-[2rem]"
            style={{ paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom))" }}
          >
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted">小計（税込）</span>
              <span className="text-2xl font-semibold tabular-nums tracking-wide text-ink">
                {formatYen(subtotalIncl)}
              </span>
            </div>
            {earn > 0 && (
              <p className="text-right text-xs text-clay">
                ご購入で約 {earn.toLocaleString("ja-JP")} ポイント付与
              </p>
            )}
            <a
              href={`/shop/${slug}/checkout`}
              className="flex h-14 w-full items-center justify-center rounded-full bg-accent text-sm font-semibold tracking-[0.12em] text-accent-fg shadow-[0_14px_30px_-14px_rgba(68,85,58,0.8)] transition-all duration-500 ease-silk hover:-translate-y-0.5 hover:bg-accent-hover active:scale-[0.98]"
            >
              ご購入手続きへ
            </a>
            <button
              onClick={onClose}
              className="w-full text-center text-xs text-muted transition-colors hover:text-ink"
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
  children,
  ariaLabel,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
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
      className="flex h-full w-8 items-center justify-center rounded-full text-muted transition-colors hover:text-ink disabled:opacity-30"
    >
      {children}
    </button>
  );
}
