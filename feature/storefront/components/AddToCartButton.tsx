"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { addToCart } from "@/feature/storefront/lib/cart";

export function AddToCartButton({
  slug,
  productId,
  stock,
}: {
  slug: string;
  productId: number;
  stock: number;
}) {
  const [qty, setQty] = useState(1);
  const sold = stock <= 0;

  function go() {
    addToCart(slug, productId, qty);
    window.location.href = `/shop/${slug}?cart=open`;
  }

  if (sold) {
    return (
      <Button className="w-full" disabled>
        在庫切れ
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => setQty((q) => Math.max(1, q - 1))}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-line text-muted hover:bg-elevated"
        >
          −
        </button>
        <span className="w-8 text-center tabular-nums">{qty}</span>
        <button
          onClick={() => setQty((q) => Math.min(stock, q + 1))}
          disabled={qty >= stock}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-line text-muted hover:bg-elevated disabled:opacity-40"
        >
          ＋
        </button>
      </div>
      <Button className="flex-1" onClick={go}>
        カートに入れる
      </Button>
    </div>
  );
}
