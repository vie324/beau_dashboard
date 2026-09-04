"use client";

import { useEffect, useRef, useState } from "react";
import { StarRating } from "@/feature/storefront/components/StarRating";
import { PriceTag } from "@/feature/storefront/components/PriceTag";
import {
  HeartIcon,
  CheckIcon,
  TrophyIcon,
} from "@/feature/storefront/components/icons";
import type { StorefrontProduct } from "@/feature/storefront/services/getStorefront";
import { parseImageUrls } from "@/helper/utils/retail";

export function ProductCard({
  product: p,
  slug,
  wished,
  pointRatePercent,
  onAdd,
  onToggleWish,
}: {
  product: StorefrontProduct;
  slug: string;
  wished: boolean;
  pointRatePercent: number;
  onAdd: (id: number) => boolean | void;
  onToggleWish: (id: number) => void;
}) {
  const img = parseImageUrls(p.imageUrls)[0];
  const sold = p.stock <= 0;
  const low = !sold && p.stock <= 3;
  const earn =
    pointRatePercent > 0 ? Math.floor((p.price * pointRatePercent) / 100) : 0;
  const [justAdded, setJustAdded] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  function add() {
    const ok = onAdd(p.id);
    if (ok === false) return;
    setJustAdded(true);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setJustAdded(false), 1400);
  }

  const href = `/shop/${slug}/item/${p.id}`;

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-panel transition-all duration-200 hover:-translate-y-1 hover:border-accent/40 hover:shadow-lg">
      <div className="relative">
        <a href={href} className="block aspect-square overflow-hidden bg-elevated">
          {img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={img}
              alt={p.name}
              loading="lazy"
              className={
                "h-full w-full object-cover transition-transform duration-500 group-hover:scale-105 " +
                (sold ? "opacity-60 grayscale" : "")
              }
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-faint">
              <span className="font-display text-2xl tracking-widest text-line">
                Beau
              </span>
              <span className="text-[10px]">画像準備中</span>
            </div>
          )}
          {sold && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="rounded-full bg-ink/80 px-3 py-1 text-xs font-bold tracking-wider text-surface">
                SOLD OUT
              </span>
            </div>
          )}
        </a>

        {/* バッジ群（左上） */}
        <div className="pointer-events-none absolute left-2 top-2 flex flex-col items-start gap-1">
          {p.salesRank != null && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-ink px-2 py-0.5 text-[10px] font-bold text-accent shadow">
              <TrophyIcon size={11} />
              人気No.{p.salesRank}
            </span>
          )}
          {p.discountPercent > 0 && (
            <span className="rounded-full bg-danger px-2 py-0.5 text-[10px] font-bold text-white shadow">
              {p.discountPercent}%OFF
            </span>
          )}
          {p.isNew && (
            <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold tracking-wide text-accent-fg shadow">
              NEW
            </span>
          )}
          {p.isFeatured && (
            <span className="rounded-full border border-accent/40 bg-surface/95 px-2 py-0.5 text-[10px] font-bold text-accent shadow">
              スタッフおすすめ
            </span>
          )}
        </div>
        {low && (
          <span className="pointer-events-none absolute bottom-2 left-2 rounded-full bg-warn px-2 py-0.5 text-[10px] font-bold text-white shadow">
            残り{p.stock}点
          </span>
        )}

        {/* お気に入り */}
        <button
          type="button"
          onClick={() => onToggleWish(p.id)}
          aria-label={wished ? "お気に入りから削除" : "お気に入りに追加"}
          aria-pressed={wished}
          className={
            "absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full border bg-surface/90 backdrop-blur transition-all hover:scale-110 " +
            (wished
              ? "animate-pop border-danger/40 text-danger"
              : "border-line text-faint hover:text-danger")
          }
        >
          <HeartIcon size={17} filled={wished} />
        </button>
      </div>

      <div className="flex flex-1 flex-col p-3">
        <a
          href={href}
          className="line-clamp-2 text-sm font-medium leading-snug text-ink transition-colors hover:text-accent"
        >
          {p.name}
        </a>
        {p.tagline && (
          <p className="mt-0.5 line-clamp-1 text-[11px] text-muted">{p.tagline}</p>
        )}

        {p.ratingCount > 0 && (
          <div className="mt-1 flex items-center gap-1">
            <StarRating value={p.ratingAvg} size={12} />
            <span className="text-[11px] text-faint">({p.ratingCount})</span>
          </div>
        )}

        <PriceTag
          className="mt-1.5"
          price={p.price}
          compareAtPrice={p.compareAtPrice}
          taxRate={p.taxRate}
        />
        {earn > 0 && (
          <p className="mt-0.5 text-[11px] font-medium text-accent">
            +{earn.toLocaleString("ja-JP")}pt 貯まる
          </p>
        )}
        <div className="pb-2.5" />

        <button
          type="button"
          disabled={sold}
          onClick={add}
          className={
            "mt-auto inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border text-xs font-semibold tracking-wide transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 " +
            (justAdded
              ? "border-ok/40 bg-ok/10 text-ok"
              : "border-transparent bg-accent text-accent-fg hover:bg-accent-hover")
          }
        >
          {sold ? (
            "売り切れ"
          ) : justAdded ? (
            <>
              <CheckIcon size={14} />
              追加しました
            </>
          ) : (
            "カートに入れる"
          )}
        </button>
      </div>
    </article>
  );
}
