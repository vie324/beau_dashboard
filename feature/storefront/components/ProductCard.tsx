"use client";

import { Button } from "@/components/ui/Button";
import { StarRating } from "@/feature/storefront/components/StarRating";
import type { StorefrontProduct } from "@/feature/storefront/services/getStorefront";
import { formatYen, taxInclusiveUnit, parseImageUrls } from "@/helper/utils/retail";

export function ProductCard({
  product: p,
  slug,
  wished,
  onAdd,
  onToggleWish,
}: {
  product: StorefrontProduct;
  slug: string;
  wished: boolean;
  onAdd: (id: number) => void;
  onToggleWish: (id: number) => void;
}) {
  const img = parseImageUrls(p.imageUrls)[0];
  const sold = p.stock <= 0;
  const low = !sold && p.stock <= 3;

  return (
    <div className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-panel transition-all duration-200 hover:-translate-y-1 hover:border-accent/40 hover:shadow-lg">
      <div className="relative">
        <a
          href={`/shop/${slug}/item/${p.id}`}
          className="block aspect-square overflow-hidden bg-elevated"
        >
          {img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={img}
              alt={p.name}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm text-faint">
              No Image
            </div>
          )}
        </a>

        {/* バッジ群 */}
        <div className="pointer-events-none absolute left-2 top-2 flex flex-col gap-1">
          {p.isNew && (
            <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold tracking-wide text-accent-fg shadow">
              NEW
            </span>
          )}
          {low && (
            <span className="rounded-full bg-warn px-2 py-0.5 text-[10px] font-bold text-white shadow">
              残り{p.stock}点
            </span>
          )}
          {sold && (
            <span className="rounded-full bg-ink/80 px-2 py-0.5 text-[10px] font-bold text-surface shadow">
              在庫切れ
            </span>
          )}
        </div>

        {/* お気に入り */}
        <button
          type="button"
          onClick={() => onToggleWish(p.id)}
          aria-label={wished ? "お気に入りから削除" : "お気に入りに追加"}
          className={
            "absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full border bg-surface/90 text-lg backdrop-blur transition-all hover:scale-110 " +
            (wished
              ? "border-danger/40 text-danger animate-pop"
              : "border-line text-faint hover:text-danger")
          }
        >
          {wished ? "♥" : "♡"}
        </button>
      </div>

      <div className="flex flex-1 flex-col p-3">
        <a
          href={`/shop/${slug}/item/${p.id}`}
          className="line-clamp-2 text-sm font-medium text-ink transition-colors hover:text-accent"
        >
          {p.name}
        </a>

        {p.ratingCount > 0 && (
          <div className="mt-1 flex items-center gap-1">
            <StarRating value={p.ratingAvg} size={13} />
            <span className="text-[11px] text-faint">({p.ratingCount})</span>
          </div>
        )}

        <div className="mt-1.5 flex items-baseline gap-1">
          <span className="text-base font-bold tabular-nums text-ink">
            {formatYen(taxInclusiveUnit(p.price, p.taxRate))}
          </span>
          <span className="text-[10px] text-faint">税込</span>
        </div>

        <Button
          size="sm"
          className="mt-2 transition-transform active:scale-95"
          disabled={sold}
          onClick={() => onAdd(p.id)}
        >
          {sold ? "売り切れ" : "カートに入れる"}
        </Button>
      </div>
    </div>
  );
}
