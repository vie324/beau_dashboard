"use client";

import { useEffect, useRef, useState } from "react";
import { StarRating } from "@/feature/storefront/components/StarRating";
import { PriceTag } from "@/feature/storefront/components/PriceTag";
import { ProductImagePlaceholder } from "@/feature/storefront/components/ProductImagePlaceholder";
import {
  HeartIcon,
  CheckIcon,
  TrophyIcon,
  PlusIcon,
} from "@/feature/storefront/components/icons";
import type { StorefrontProduct } from "@/feature/storefront/services/getStorefront";
import { parseImageUrls } from "@/helper/utils/retail";

/**
 * 商品カード。縦長の写真（ホバーで2枚目に切り替え）+ 名前・価格。
 * PC は写真にカーソルを乗せると「カートに入れる」が下から出る。スマホは常にボタンを表示。
 */
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
  const [img, hoverImg] = parseImageUrls(p.imageUrls);
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
  const addLabel = sold ? "売り切れ" : justAdded ? "追加しました" : "カートに入れる";

  return (
    <article className="group relative flex h-full flex-col">
      <div className="relative overflow-hidden rounded-[1.25rem] bg-elevated">
        <a href={href} className="block aspect-[4/5]" aria-label={p.name}>
          {img ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img}
                alt={p.name}
                loading="lazy"
                className={
                  "h-full w-full object-cover transition-transform duration-[1.4s] ease-silk group-hover:scale-[1.06] " +
                  (sold ? "opacity-60 grayscale" : "")
                }
              />
              {hoverImg && !sold && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={hoverImg}
                  alt=""
                  loading="lazy"
                  className="absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-700 ease-silk group-hover:opacity-100"
                />
              )}
            </>
          ) : (
            <ProductImagePlaceholder name={p.name} />
          )}
          {sold && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="rounded-full bg-ink/80 px-4 py-1.5 font-accent text-sm tracking-[0.2em] text-surface">
                SOLD OUT
              </span>
            </div>
          )}
        </a>

        {/* バッジ（左上） */}
        <div className="pointer-events-none absolute left-2.5 top-2.5 flex flex-col items-start gap-1">
          {p.salesRank != null && (
            <span className="inline-flex items-center gap-1 rounded-full bg-surface/90 px-2 py-0.5 text-[10px] font-semibold text-ink shadow-sm backdrop-blur">
              <TrophyIcon size={11} className="text-clay" />
              人気No.{p.salesRank}
            </span>
          )}
          {p.discountPercent > 0 && (
            <span className="rounded-full bg-danger px-2 py-0.5 text-[10px] font-bold tracking-wide text-white shadow-sm">
              {p.discountPercent}%OFF
            </span>
          )}
          {p.isNew && (
            <span className="rounded-full bg-clay px-2 py-0.5 font-accent text-[11px] font-semibold italic tracking-[0.12em] text-white shadow-sm">
              New
            </span>
          )}
          {p.isFeatured && (
            <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-accent-fg shadow-sm">
              スタッフおすすめ
            </span>
          )}
        </div>
        {low && (
          <span className="pointer-events-none absolute bottom-2.5 left-2.5 rounded-full bg-surface/90 px-2 py-0.5 text-[10px] font-semibold text-warn shadow-sm backdrop-blur md:group-hover:opacity-0">
            残りわずか（{p.stock}点）
          </span>
        )}

        {/* お気に入り */}
        <button
          type="button"
          onClick={() => onToggleWish(p.id)}
          aria-label={wished ? "お気に入りから削除" : "お気に入りに追加"}
          aria-pressed={wished}
          className={
            "absolute right-2.5 top-2.5 flex h-9 w-9 items-center justify-center rounded-full bg-surface/85 backdrop-blur transition-all duration-300 hover:scale-110 " +
            (wished ? "animate-pop text-danger" : "text-muted hover:text-danger")
          }
        >
          <HeartIcon size={17} filled={wished} />
        </button>

        {/* PC: ホバーで出る「カートに入れる」 */}
        <button
          type="button"
          disabled={sold}
          onClick={add}
          className={
            "absolute inset-x-2.5 bottom-2.5 hidden h-10 items-center justify-center gap-1.5 rounded-full text-xs font-semibold tracking-[0.12em] shadow-panel backdrop-blur transition-all duration-500 ease-silk disabled:hidden md:flex " +
            (justAdded
              ? "translate-y-0 bg-ok text-white"
              : "translate-y-[140%] bg-surface/95 text-ink hover:bg-accent hover:text-accent-fg focus-visible:translate-y-0 group-hover:translate-y-0")
          }
        >
          {justAdded ? <CheckIcon size={14} /> : <PlusIcon size={14} />}
          {addLabel}
        </button>
      </div>

      <div className="flex flex-1 flex-col px-0.5 pt-3">
        {p.tagline && (
          <p className="line-clamp-1 text-[11px] tracking-wider text-faint">{p.tagline}</p>
        )}
        <a
          href={href}
          className="mt-0.5 line-clamp-2 text-[14px] font-medium leading-relaxed text-ink transition-colors hover:text-accent"
        >
          {p.name}
        </a>

        {p.ratingCount > 0 && (
          <div className="mt-1 flex items-center gap-1">
            <StarRating value={p.ratingAvg} size={12} />
            <span className="text-[11px] text-faint">({p.ratingCount})</span>
          </div>
        )}

        <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-2">
          <PriceTag price={p.price} compareAtPrice={p.compareAtPrice} taxRate={p.taxRate} />
          {earn > 0 && (
            <span className="text-[11px] font-medium text-clay">
              +{earn.toLocaleString("ja-JP")}pt
            </span>
          )}
        </div>

        {/* スマホ: 常に見えるボタン（下端にそろえる） */}
        <div className="min-h-3 flex-1 md:hidden" />
        <button
          type="button"
          disabled={sold}
          onClick={add}
          className={
            "inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-full border text-xs font-semibold tracking-wider transition-all duration-300 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 md:hidden " +
            (justAdded
              ? "border-ok/40 bg-ok/10 text-ok"
              : "border-accent/50 text-accent-hover active:bg-accent active:text-accent-fg")
          }
        >
          {justAdded ? <CheckIcon size={14} /> : sold ? null : <PlusIcon size={14} />}
          {addLabel}
        </button>
      </div>
    </article>
  );
}
