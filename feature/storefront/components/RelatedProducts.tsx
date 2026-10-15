"use client";

import { useEffect, useState } from "react";
import { ProductCard } from "@/feature/storefront/components/ProductCard";
import { Reveal } from "@/feature/storefront/components/Reveal";
import type { StorefrontProduct } from "@/feature/storefront/services/getStorefront";
import { addToCart } from "@/feature/storefront/lib/cart";
import { readWishlist, toggleWishlist } from "@/feature/storefront/lib/wishlist";

/** 商品ページ下部の「こちらもおすすめ」。トップと同じ商品カードで並べる。 */
export function RelatedProducts({
  slug,
  products,
  pointRatePercent,
}: {
  slug: string;
  products: StorefrontProduct[];
  pointRatePercent: number;
}) {
  const [wishlist, setWishlist] = useState<number[]>([]);
  useEffect(() => setWishlist(readWishlist(slug)), [slug]);

  return (
    <section className="mt-24 sm:mt-32">
      <Reveal>
        <p className="font-accent text-md italic tracking-[0.28em] text-accent">You may also like</p>
        <h2 className="mb-8 mt-1 font-display text-[1.55rem] font-semibold tracking-[0.1em] text-ink sm:text-[2rem]">
          こちらもおすすめ
        </h2>
      </Reveal>
      <div className="grid grid-cols-2 gap-x-3 gap-y-9 sm:grid-cols-4 sm:gap-x-5">
        {products.map((p, i) => (
          <Reveal key={p.id} delay={i * 80} className="h-full">
            <ProductCard
              product={p}
              slug={slug}
              wished={wishlist.includes(p.id)}
              pointRatePercent={pointRatePercent}
              onAdd={(id) => {
                if (p.stock <= 0) return false;
                addToCart(slug, id, 1);
              }}
              onToggleWish={(id) => setWishlist(toggleWishlist(slug, id))}
            />
          </Reveal>
        ))}
      </div>
    </section>
  );
}
