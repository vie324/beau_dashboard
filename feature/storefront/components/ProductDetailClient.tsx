"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { StarRating } from "@/feature/storefront/components/StarRating";
import { PriceTag } from "@/feature/storefront/components/PriceTag";
import { ProductImagePlaceholder } from "@/feature/storefront/components/ProductImagePlaceholder";
import { BenefitIcon } from "@/feature/storefront/components/BenefitIcon";
import {
  HeartIcon,
  ShareIcon,
  CoinIcon,
  TrophyIcon,
  CheckIcon,
  MinusIcon,
  PlusIcon,
} from "@/feature/storefront/components/icons";
import { storeBenefits } from "@/feature/storefront/lib/benefits";
import type {
  StorefrontProduct,
  StorefrontShop,
} from "@/feature/storefront/services/getStorefront";
import { addToCart } from "@/feature/storefront/lib/cart";
import { readWishlist, toggleWishlist } from "@/feature/storefront/lib/wishlist";
import { pushRecentlyViewed } from "@/feature/storefront/lib/recentlyViewed";
import {
  formatYen,
  taxInclusiveUnit,
  parseImageUrls,
} from "@/helper/utils/retail";

export function ProductDetailClient({
  slug,
  product,
  shop,
  categoryName,
}: {
  slug: string;
  product: StorefrontProduct;
  shop: StorefrontShop;
  categoryName?: string | null;
}) {
  const images = parseImageUrls(product.imageUrls);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState(0);
  const [qty, setQty] = useState(1);
  const [wished, setWished] = useState(false);
  const [added, setAdded] = useState(false);
  const [shared, setShared] = useState(false);
  const [ctaVisible, setCtaVisible] = useState(true);
  const ctaRef = useRef<HTMLDivElement | null>(null);
  const sold = product.stock <= 0;
  const low = !sold && product.stock <= 3;
  const maxQty = Math.min(product.stock, 99);
  const earn =
    shop.pointRatePercent > 0
      ? Math.floor((product.price * qty * shop.pointRatePercent) / 100)
      : 0;
  const unitIncl = taxInclusiveUnit(product.price, product.taxRate);

  useEffect(() => {
    pushRecentlyViewed(slug, product.id);
    setWished(readWishlist(slug).includes(product.id));
  }, [slug, product.id]);

  // メインの「カートに入れる」が画面外に出たらスマホ用の固定バーを出す
  useEffect(() => {
    const el = ctaRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(
      ([entry]) => setCtaVisible(entry.isIntersecting),
      { threshold: 0 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // ギャラリー: 横スワイプ（scroll-snap）。サムネイルを押したらその写真までスクロールする。
  function goTo(i: number) {
    const el = trackRef.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
    setActive(i);
  }
  function onTrackScroll() {
    const el = trackRef.current;
    if (!el || el.clientWidth === 0) return;
    setActive(Math.round(el.scrollLeft / el.clientWidth));
  }

  const benefits = storeBenefits(shop).filter(
    (b) => b.kind === "shipping" || b.kind === "pickup" || b.kind === "redeem",
  );

  function add() {
    if (sold) return;
    addToCart(slug, product.id, qty);
    setAdded(true);
  }

  async function share() {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: product.name, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setShared(true);
      window.setTimeout(() => setShared(false), 1600);
    } catch {
      /* キャンセル等は無視 */
    }
  }

  return (
    <>
      <div className="grid gap-8 md:grid-cols-2 md:gap-12 lg:gap-16">
        {/* ギャラリー（PC ではスクロールしても追従） */}
        <div className="md:sticky md:top-24 md:self-start">
          <div className="relative animate-rise">
            <div
              ref={trackRef}
              onScroll={onTrackScroll}
              className="no-scrollbar flex aspect-[4/5] snap-x snap-mandatory overflow-x-auto overflow-y-hidden rounded-[2rem] bg-elevated"
            >
              {images.length > 0 ? (
                images.map((src, i) => (
                  <div key={i} className="h-full w-full shrink-0 snap-center overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={src}
                      alt={i === 0 ? product.name : ""}
                      className={"h-full w-full object-cover " + (i === 0 ? "animate-settle" : "")}
                    />
                  </div>
                ))
              ) : (
                <div className="h-full w-full shrink-0">
                  <ProductImagePlaceholder name={product.name} size="lg" />
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() =>
                setWished(toggleWishlist(slug, product.id).includes(product.id))
              }
              aria-label={wished ? "お気に入りから削除" : "お気に入りに追加"}
              aria-pressed={wished}
              className={
                "absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full bg-surface/85 backdrop-blur transition-all duration-300 hover:scale-110 " +
                (wished ? "animate-pop text-danger" : "text-muted hover:text-danger")
              }
            >
              <HeartIcon size={20} filled={wished} />
            </button>
            <div className="pointer-events-none absolute left-4 top-4 flex flex-col items-start gap-1.5">
              {product.salesRank != null && (
                <span className="inline-flex items-center gap-1 rounded-full bg-surface/90 px-2.5 py-1 text-[11px] font-semibold text-ink backdrop-blur">
                  <TrophyIcon size={12} className="text-clay" />
                  人気No.{product.salesRank}
                </span>
              )}
              {product.discountPercent > 0 && (
                <span className="rounded-full bg-danger px-2.5 py-1 text-[11px] font-bold text-white">
                  {product.discountPercent}%OFF
                </span>
              )}
              {product.isNew && (
                <span className="rounded-full bg-clay px-2.5 py-0.5 font-accent text-sm font-semibold italic tracking-[0.12em] text-white">
                  New
                </span>
              )}
            </div>
            {/* スマホ: 何枚目かのドット */}
            {images.length > 1 && (
              <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center gap-1.5 sm:hidden">
                {images.map((_, i) => (
                  <span
                    key={i}
                    className={
                      "h-1.5 rounded-full bg-surface transition-all duration-500 " +
                      (i === active ? "w-5 opacity-100" : "w-1.5 opacity-60")
                    }
                  />
                ))}
              </div>
            )}
          </div>
          {images.length > 1 && (
            <div className="no-scrollbar mt-3 hidden gap-3 overflow-x-auto p-1 sm:flex">
              {images.map((src, i) => (
                <button
                  key={i}
                  onClick={() => goTo(i)}
                  aria-label={`画像 ${i + 1}`}
                  className={
                    "aspect-[4/5] w-20 shrink-0 overflow-hidden rounded-xl transition-all duration-300 " +
                    (i === active
                      ? "ring-2 ring-accent ring-offset-2 ring-offset-base"
                      : "opacity-60 hover:opacity-100")
                  }
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 情報 */}
        <div className="space-y-8 md:pt-2">
          <div className="animate-rise [animation-delay:120ms]">
            <div className="flex flex-wrap items-center gap-2">
              {categoryName && (
                <span className="text-[11px] tracking-[0.2em] text-accent">{categoryName}</span>
              )}
              {product.isFeatured && (
                <span className="rounded-full bg-accent px-2.5 py-0.5 text-[10px] font-semibold tracking-wider text-accent-fg">
                  スタッフおすすめ
                </span>
              )}
            </div>
            <h1 className="mt-2 font-display text-[1.65rem] font-semibold leading-[1.55] tracking-[0.08em] text-ink [word-break:auto-phrase] sm:text-[2.1rem]">
              {product.name}
            </h1>
            {product.tagline && (
              <p className="mt-2 text-sm leading-relaxed text-muted">{product.tagline}</p>
            )}
            {product.ratingCount > 0 && (
              <a href="#reviews" className="mt-3 inline-flex items-center gap-1.5">
                <StarRating value={product.ratingAvg} size={15} />
                <span className="text-sm font-medium text-ink">
                  {product.ratingAvg.toFixed(1)}
                </span>
                <span className="text-xs text-faint underline-offset-4 hover:underline">
                  （{product.ratingCount}件のレビュー）
                </span>
              </a>
            )}
          </div>

          <div className="animate-rise border-y border-line py-6 [animation-delay:200ms]">
            <PriceTag
              size="lg"
              price={product.price}
              compareAtPrice={product.compareAtPrice}
              taxRate={product.taxRate}
            />
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
              {sold ? (
                <span className="rounded-full bg-danger/10 px-2.5 py-1 font-medium text-danger">在庫切れ</span>
              ) : low ? (
                <span className="rounded-full bg-warn/10 px-2.5 py-1 font-medium text-warn">
                  残り{product.stock}点・お早めに
                </span>
              ) : (
                <span className="rounded-full bg-ok/10 px-2.5 py-1 font-medium text-ok">在庫あり</span>
              )}
              {shop.pointRatePercent > 0 && !sold && (
                <span className="inline-flex items-center gap-1 rounded-full bg-clay-soft px-2.5 py-1 font-medium text-clay">
                  <CoinIcon size={13} />
                  {shop.pointRatePercent}%ポイント還元
                  {shop.pointCampaign && "（期間限定）"}
                </span>
              )}
            </div>
          </div>

          {product.isFeatured && product.featuredComment && (
            <figure className="relative animate-rise rounded-[1.5rem] bg-accent-soft/70 px-6 pb-5 pt-7 [animation-delay:260ms]">
              <span
                aria-hidden
                className="absolute left-5 top-1 font-accent text-6xl leading-none text-clay/70"
              >
                “
              </span>
              <blockquote className="font-display text-sm leading-[2] text-ink/90">
                {product.featuredComment}
              </blockquote>
              <figcaption className="mt-3 font-accent text-sm italic tracking-[0.2em] text-accent">
                — Staff&apos;s Note
              </figcaption>
            </figure>
          )}

          {/* 数量 + カート */}
          <div ref={ctaRef} className="animate-rise [animation-delay:320ms]">
            {sold ? (
              <Button className="h-14 w-full rounded-full" disabled>
                在庫切れ
              </Button>
            ) : added ? (
              <div className="animate-scale-in space-y-3 rounded-[1.5rem] border border-ok/30 bg-ok/10 p-4 text-center">
                <p className="inline-flex items-center gap-1.5 text-sm font-medium text-ok">
                  <CheckIcon size={16} />
                  カートに追加しました
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="h-12 flex-1 rounded-full"
                    onClick={() => setAdded(false)}
                  >
                    続けて見る
                  </Button>
                  <a
                    href={`/shop/${slug}/checkout`}
                    className="flex h-12 flex-1 items-center justify-center rounded-full bg-accent text-sm font-semibold tracking-wider text-accent-fg transition-colors hover:bg-accent-hover"
                  >
                    ご購入手続きへ
                  </a>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="flex h-14 items-center rounded-full border border-line bg-surface">
                  <button
                    onClick={() => setQty((q) => Math.max(1, q - 1))}
                    disabled={qty <= 1}
                    aria-label="数量を減らす"
                    className="flex h-full w-11 items-center justify-center rounded-l-full text-muted transition-colors hover:text-ink disabled:opacity-30"
                  >
                    <MinusIcon size={16} />
                  </button>
                  <span className="w-7 text-center text-md tabular-nums text-ink">{qty}</span>
                  <button
                    onClick={() => setQty((q) => Math.min(maxQty, q + 1))}
                    disabled={qty >= maxQty}
                    aria-label="数量を増やす"
                    className="flex h-full w-11 items-center justify-center rounded-r-full text-muted transition-colors hover:text-ink disabled:opacity-30"
                  >
                    <PlusIcon size={16} />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={add}
                  className="h-14 flex-1 rounded-full bg-accent px-4 text-sm font-semibold tracking-[0.1em] text-accent-fg shadow-[0_14px_30px_-14px_rgba(68,85,58,0.8)] transition-all duration-500 ease-silk hover:-translate-y-0.5 hover:bg-accent-hover active:scale-[0.98]"
                >
                  カートに入れる
                  <span className="ml-2 font-normal tabular-nums opacity-80">
                    {formatYen(unitIncl * qty)}
                  </span>
                </button>
              </div>
            )}
            {earn > 0 && !sold && !added && (
              <p className="mt-3 text-center text-xs text-clay sm:text-left">
                このご購入で +{earn.toLocaleString("ja-JP")}pt 貯まります
              </p>
            )}
          </div>

          {/* 特典・受け取り */}
          {benefits.length > 0 && (
            <ul className="divide-y divide-line rounded-[1.5rem] border border-line bg-surface/70">
              {benefits.map((b) => (
                <li key={b.kind} className="flex items-start gap-3 px-5 py-3.5">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-hover">
                    <BenefitIcon kind={b.kind} size={15} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium text-ink">{b.label}</span>
                    <span className="block text-[11px] leading-relaxed text-muted">{b.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}

          {product.description && (
            <section>
              <p className="font-accent text-md italic tracking-[0.28em] text-accent">About</p>
              <h2 className="mt-1 font-display text-lg font-semibold tracking-[0.1em] text-ink">
                商品について
              </h2>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-[2] text-ink/85">
                {product.description}
              </p>
            </section>
          )}

          <button
            type="button"
            onClick={() => void share()}
            className="inline-flex items-center gap-1.5 rounded-full border border-line px-4 py-2 text-xs text-muted transition-colors hover:border-accent hover:text-accent"
          >
            <ShareIcon size={14} />
            {shared ? "リンクをコピーしました" : "この商品をシェアする"}
          </button>
        </div>
      </div>

      {/* スマホ用の固定バー（メインのボタンが見えないときだけ） */}
      {!sold && !added && !ctaVisible && (
        <div
          className="fixed inset-x-0 bottom-0 z-30 animate-rise border-t border-line/70 bg-base/90 px-4 py-3 backdrop-blur-md md:hidden"
          style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
        >
          <div className="mx-auto flex max-w-3xl items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs text-muted">{product.name}</div>
              <div className="text-md font-semibold tabular-nums text-ink">
                {formatYen(unitIncl * qty)}
                <span className="ml-1 text-[10px] font-normal text-faint">税込</span>
              </div>
            </div>
            <button
              type="button"
              onClick={add}
              className="h-12 rounded-full bg-accent px-7 text-sm font-semibold tracking-wider text-accent-fg transition-colors hover:bg-accent-hover"
            >
              カートに入れる
            </button>
          </div>
        </div>
      )}
    </>
  );
}
