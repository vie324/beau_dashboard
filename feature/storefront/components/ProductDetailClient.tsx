"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { StarRating } from "@/feature/storefront/components/StarRating";
import type { StorefrontProduct } from "@/feature/storefront/services/getStorefront";
import { addToCart } from "@/feature/storefront/lib/cart";
import { readWishlist, toggleWishlist } from "@/feature/storefront/lib/wishlist";
import { pushRecentlyViewed } from "@/feature/storefront/lib/recentlyViewed";
import { formatYen, taxInclusiveUnit, parseImageUrls } from "@/helper/utils/retail";

export function ProductDetailClient({
  slug,
  product,
}: {
  slug: string;
  product: StorefrontProduct;
}) {
  const images = parseImageUrls(product.imageUrls);
  const [active, setActive] = useState(0);
  const [qty, setQty] = useState(1);
  const [wished, setWished] = useState(false);
  const [added, setAdded] = useState(false);
  const sold = product.stock <= 0;
  const low = !sold && product.stock <= 3;

  useEffect(() => {
    pushRecentlyViewed(slug, product.id);
    setWished(readWishlist(slug).includes(product.id));
  }, [slug, product.id]);

  function add() {
    if (sold) return;
    addToCart(slug, product.id, qty);
    setAdded(true);
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-panel">
      {/* メイン画像 */}
      <div className="relative aspect-square bg-elevated">
        {images[active] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={images[active]}
            alt={product.name}
            className="h-full w-full animate-fade-in object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-faint">
            No Image
          </div>
        )}
        <button
          type="button"
          onClick={() => setWished(toggleWishlist(slug, product.id).includes(product.id))}
          aria-label={wished ? "お気に入りから削除" : "お気に入りに追加"}
          className={
            "absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full border bg-surface/90 text-xl backdrop-blur transition-all hover:scale-110 " +
            (wished
              ? "border-danger/40 text-danger animate-pop"
              : "border-line text-faint hover:text-danger")
          }
        >
          {wished ? "♥" : "♡"}
        </button>
        <div className="absolute left-3 top-3 flex flex-col gap-1">
          {product.isNew && (
            <span className="rounded-full bg-accent px-2.5 py-1 text-[11px] font-bold text-accent-fg shadow">
              NEW
            </span>
          )}
        </div>
      </div>

      {/* サムネイル */}
      {images.length > 1 && (
        <div className="no-scrollbar flex gap-2 overflow-x-auto p-3">
          {images.map((src, i) => (
            <button
              key={i}
              onClick={() => setActive(i)}
              className={
                "h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 transition-colors " +
                (i === active ? "border-accent" : "border-transparent opacity-70")
              }
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}

      <div className="space-y-4 p-5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold text-ink">{product.name}</h1>
            {sold && (
              <Badge className="border-line bg-elevated text-muted">在庫切れ</Badge>
            )}
            {low && (
              <Badge className="border-warn/40 bg-warn/10 text-warn">
                残り{product.stock}点
              </Badge>
            )}
          </div>
          {product.ratingCount > 0 && (
            <div className="mt-1.5 flex items-center gap-1.5">
              <StarRating value={product.ratingAvg} size={16} />
              <span className="text-sm font-medium text-ink">
                {product.ratingAvg.toFixed(1)}
              </span>
              <span className="text-xs text-faint">
                ({product.ratingCount}件)
              </span>
            </div>
          )}
          <p className="mt-2 text-2xl font-bold tabular-nums text-ink">
            {formatYen(taxInclusiveUnit(product.price, product.taxRate))}
            <span className="ml-1 text-xs font-normal text-faint">（税込）</span>
          </p>
        </div>

        {product.description && (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted">
            {product.description}
          </p>
        )}

        {/* 数量 + カート */}
        {sold ? (
          <Button className="w-full" disabled>
            在庫切れ
          </Button>
        ) : added ? (
          <div className="animate-scale-in space-y-2 rounded-xl border border-ok/30 bg-ok/10 p-3 text-center">
            <p className="text-sm font-medium text-ok">カートに追加しました</p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setAdded(false)}
              >
                続けて見る
              </Button>
              <Button
                className="flex-1"
                onClick={() => (window.location.href = `/shop/${slug}?cart=open`)}
              >
                カートを見る
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-line text-muted hover:bg-elevated"
              >
                −
              </button>
              <span className="w-8 text-center tabular-nums">{qty}</span>
              <button
                onClick={() =>
                  setQty((q) => Math.min(Math.min(product.stock, 99), q + 1))
                }
                disabled={qty >= Math.min(product.stock, 99)}
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-line text-muted hover:bg-elevated disabled:opacity-40"
              >
                ＋
              </button>
            </div>
            <Button className="flex-1 transition-transform active:scale-95" onClick={add}>
              カートに入れる
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
