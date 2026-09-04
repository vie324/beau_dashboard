"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { StarRating } from "@/feature/storefront/components/StarRating";
import { PriceTag } from "@/feature/storefront/components/PriceTag";
import {
  HeartIcon,
  ShareIcon,
  StoreIcon,
  TruckIcon,
  CoinIcon,
  TrophyIcon,
  CheckIcon,
} from "@/feature/storefront/components/icons";
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
}: {
  slug: string;
  product: StorefrontProduct;
  shop: StorefrontShop;
}) {
  const images = parseImageUrls(product.imageUrls);
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
      <div className="grid gap-6 md:grid-cols-2 md:gap-10">
        {/* ギャラリー */}
        <div>
          <div className="relative aspect-square overflow-hidden rounded-3xl border border-line bg-elevated">
            {images[active] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={active}
                src={images[active]}
                alt={product.name}
                className="h-full w-full animate-fade-in object-cover"
              />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-faint">
                <span className="font-display text-3xl tracking-widest text-line">Beau</span>
                <span className="text-xs">画像準備中</span>
              </div>
            )}
            <button
              type="button"
              onClick={() =>
                setWished(toggleWishlist(slug, product.id).includes(product.id))
              }
              aria-label={wished ? "お気に入りから削除" : "お気に入りに追加"}
              aria-pressed={wished}
              className={
                "absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full border bg-surface/90 backdrop-blur transition-all hover:scale-110 " +
                (wished
                  ? "animate-pop border-danger/40 text-danger"
                  : "border-line text-faint hover:text-danger")
              }
            >
              <HeartIcon size={20} filled={wished} />
            </button>
            <div className="pointer-events-none absolute left-3 top-3 flex flex-col items-start gap-1">
              {product.salesRank != null && (
                <span className="inline-flex items-center gap-1 rounded-full bg-ink px-2.5 py-1 text-[11px] font-bold text-accent shadow">
                  <TrophyIcon size={12} />
                  人気No.{product.salesRank}
                </span>
              )}
              {product.discountPercent > 0 && (
                <span className="rounded-full bg-danger px-2.5 py-1 text-[11px] font-bold text-white shadow">
                  {product.discountPercent}%OFF
                </span>
              )}
              {product.isNew && (
                <span className="rounded-full bg-accent px-2.5 py-1 text-[11px] font-bold text-accent-fg shadow">
                  NEW
                </span>
              )}
            </div>
          </div>
          {images.length > 1 && (
            <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto">
              {images.map((src, i) => (
                <button
                  key={i}
                  onClick={() => setActive(i)}
                  aria-label={`画像 ${i + 1}`}
                  className={
                    "h-16 w-16 shrink-0 overflow-hidden rounded-xl border-2 transition-colors " +
                    (i === active ? "border-accent" : "border-transparent opacity-70")
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
        <div className="space-y-5">
          <div>
            {product.isFeatured && (
              <p className="mb-1 inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent-soft px-2.5 py-0.5 text-[11px] font-semibold text-accent">
                スタッフおすすめ
              </p>
            )}
            <h1 className="font-display text-2xl leading-snug tracking-wide text-ink sm:text-3xl">
              {product.name}
            </h1>
            {product.tagline && (
              <p className="mt-1 text-sm text-muted">{product.tagline}</p>
            )}
            {product.ratingCount > 0 && (
              <a href="#reviews" className="mt-2 inline-flex items-center gap-1.5">
                <StarRating value={product.ratingAvg} size={16} />
                <span className="text-sm font-medium text-ink">
                  {product.ratingAvg.toFixed(1)}
                </span>
                <span className="text-xs text-faint">（{product.ratingCount}件のレビュー）</span>
              </a>
            )}
          </div>

          <div>
            <PriceTag
              size="lg"
              price={product.price}
              compareAtPrice={product.compareAtPrice}
              taxRate={product.taxRate}
            />
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              {sold ? (
                <span className="font-medium text-danger">在庫切れ</span>
              ) : low ? (
                <span className="font-medium text-warn">残り{product.stock}点・お早めに</span>
              ) : (
                <span className="font-medium text-ok">在庫あり</span>
              )}
              {shop.pointRatePercent > 0 && !sold && (
                <span className="inline-flex items-center gap-1 text-accent">
                  <CoinIcon size={13} />
                  {shop.pointRatePercent}%ポイント還元
                </span>
              )}
            </div>
          </div>

          {product.isFeatured && product.featuredComment && (
            <blockquote className="rounded-2xl border border-accent/30 bg-accent-soft/50 px-4 py-3 text-sm leading-relaxed text-accent-fg">
              <span className="mb-1 block text-[11px] font-semibold tracking-wider text-accent">
                スタッフより
              </span>
              “{product.featuredComment}”
            </blockquote>
          )}

          {/* 数量 + カート */}
          <div ref={ctaRef}>
            {sold ? (
              <Button className="h-12 w-full" disabled>
                在庫切れ
              </Button>
            ) : added ? (
              <div className="animate-scale-in space-y-2 rounded-2xl border border-ok/30 bg-ok/10 p-3 text-center">
                <p className="inline-flex items-center gap-1 text-sm font-medium text-ok">
                  <CheckIcon size={16} />
                  カートに追加しました
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setAdded(false)}
                  >
                    続けて見る
                  </Button>
                  <a
                    href={`/shop/${slug}/checkout`}
                    className="flex h-10 flex-1 items-center justify-center rounded-xl bg-accent text-sm font-medium text-accent-fg hover:bg-accent-hover"
                  >
                    ご購入手続きへ
                  </a>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setQty((q) => Math.max(1, q - 1))}
                    aria-label="数量を減らす"
                    className="flex h-12 w-11 items-center justify-center rounded-xl border border-line text-muted hover:bg-elevated"
                  >
                    −
                  </button>
                  <span className="w-8 text-center text-md tabular-nums text-ink">{qty}</span>
                  <button
                    onClick={() => setQty((q) => Math.min(maxQty, q + 1))}
                    disabled={qty >= maxQty}
                    aria-label="数量を増やす"
                    className="flex h-12 w-11 items-center justify-center rounded-xl border border-line text-muted hover:bg-elevated disabled:opacity-40"
                  >
                    ＋
                  </button>
                </div>
                <Button
                  className="h-12 flex-1 text-sm transition-transform active:scale-95"
                  onClick={add}
                >
                  カートに入れる・{formatYen(unitIncl * qty)}
                </Button>
              </div>
            )}
            {earn > 0 && !sold && !added && (
              <p className="mt-2 text-xs text-accent">
                このご購入で +{earn.toLocaleString("ja-JP")}pt 貯まります
              </p>
            )}
          </div>

          {/* 特典・受け取り */}
          <ul className="grid gap-2 rounded-2xl border border-line bg-surface p-3 text-xs text-muted sm:grid-cols-3">
            <li className="flex items-center gap-2">
              <StoreIcon size={16} className="shrink-0 text-accent" />
              店頭受取なら送料無料
            </li>
            <li className="flex items-center gap-2">
              <TruckIcon size={16} className="shrink-0 text-accent" />
              {shop.shippingFee === 0
                ? "全国送料無料"
                : shop.freeShippingThreshold > 0
                  ? `${formatYen(shop.freeShippingThreshold)}以上で送料無料`
                  : `配送料 ${formatYen(shop.shippingFee)}`}
            </li>
            <li className="flex items-center gap-2">
              <CoinIcon size={16} className="shrink-0 text-accent" />
              {shop.allowPointRedeem ? "ポイントでお支払いOK" : "ポイントが貯まる"}
            </li>
          </ul>

          <button
            type="button"
            onClick={() => void share()}
            className="inline-flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-accent"
          >
            <ShareIcon size={15} />
            {shared ? "リンクをコピーしました" : "この商品をシェアする"}
          </button>

          {product.description && (
            <section>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
                商品について
              </h2>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink/90">
                {product.description}
              </p>
            </section>
          )}
        </div>
      </div>

      {/* スマホ用の固定バー（メインのボタンが見えないときだけ） */}
      {!sold && !added && !ctaVisible && (
        <div
          className="fixed inset-x-0 bottom-0 z-30 animate-slide-up border-t border-line bg-surface/95 px-4 py-3 backdrop-blur md:hidden"
          style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
        >
          <div className="mx-auto flex max-w-3xl items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs text-muted">{product.name}</div>
              <div className="text-md font-bold tabular-nums text-ink">
                {formatYen(unitIncl * qty)}
                <span className="ml-1 text-[10px] font-normal text-faint">税込</span>
              </div>
            </div>
            <Button className="h-11 px-6" onClick={add}>
              カートに入れる
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
