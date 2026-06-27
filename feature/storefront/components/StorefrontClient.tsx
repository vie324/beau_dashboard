"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input, Label, Textarea, Select } from "@/components/ui/Input";
import type { StorefrontData } from "@/feature/storefront/services/getStorefront";
import { createCheckout } from "@/feature/storefront/actions/checkoutActions";
import { ProductCard } from "@/feature/storefront/components/ProductCard";
import { CartDrawer } from "@/feature/storefront/components/CartDrawer";
import {
  readCart,
  writeCart,
  clearCart,
  type CartEntry,
} from "@/feature/storefront/lib/cart";
import { readWishlist, toggleWishlist } from "@/feature/storefront/lib/wishlist";
import { readRecentlyViewed } from "@/feature/storefront/lib/recentlyViewed";
import {
  formatYen,
  taxInclusiveUnit,
  effectiveShipping,
} from "@/helper/utils/retail";

type SortKey = "recommended" | "price-asc" | "price-desc" | "new";

// 1注文あたりの数量上限（checkoutSchema の qty.max(99) と一致させる）。
const MAX_QTY = 99;

export function StorefrontClient({
  data,
  openCartInitially,
}: {
  data: StorefrontData;
  openCartInitially?: boolean;
}) {
  const { shop, products, categories } = data;
  const slug = shop.storeSlug as string;

  const [cart, setCart] = useState<CartEntry[]>([]);
  const [wishlist, setWishlist] = useState<number[]>([]);
  const [recent, setRecent] = useState<number[]>([]);
  const [query, setQuery] = useState("");
  const [activeCat, setActiveCat] = useState<number | "all" | "wish">("all");
  const [sort, setSort] = useState<SortKey>("recommended");
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const toastTimer = useRef<number | null>(null);

  const productById = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products],
  );

  // 初期化: localStorage を読み、現在の在庫・公開状況に合わせてカートを正規化する
  // （販売終了/在庫切れの除外、保存数量が在庫や上限を超えていればクランプ）。
  useEffect(() => {
    const raw = readCart(slug);
    const reconciled = raw
      .map((e) => {
        const p = productById.get(e.productId);
        if (!p || p.stock <= 0) return null;
        const cap = Math.min(p.stock, MAX_QTY);
        return { productId: e.productId, qty: Math.min(e.qty, cap) };
      })
      .filter((x): x is CartEntry => x !== null && x.qty > 0);
    setCart(reconciled);
    if (JSON.stringify(reconciled) !== JSON.stringify(raw)) {
      writeCart(slug, reconciled);
    }
    setWishlist(readWishlist(slug));
    setRecent(readRecentlyViewed(slug));
    if (openCartInitially) setCartOpen(true);
  }, [slug, openCartInitially, productById]);

  // トーストタイマーのクリーンアップ（アンマウント後の setState 防止）
  useEffect(
    () => () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    },
    [],
  );

  function persistCart(next: CartEntry[]) {
    setCart(next);
    writeCart(slug, next);
  }

  function flashToast(msg: string) {
    setToast(msg);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 1800);
  }

  function add(productId: number) {
    const p = productById.get(productId);
    if (!p || p.stock <= 0) return;
    const cap = Math.min(p.stock, MAX_QTY);
    const found = cart.find((e) => e.productId === productId);
    const current = found?.qty ?? 0;
    if (current >= cap) {
      flashToast(current >= MAX_QTY ? "数量の上限です" : "在庫の上限です");
      return;
    }
    // 既存オブジェクトを破壊せず、新しい配列・新しい要素を作る（state の不変性）
    const next = found
      ? cart.map((e) =>
          e.productId === productId ? { ...e, qty: current + 1 } : e,
        )
      : [...cart, { productId, qty: 1 }];
    persistCart(next);
    flashToast(`「${p.name}」をカートに追加しました`);
  }

  function setQty(productId: number, qty: number) {
    const p = productById.get(productId);
    const cap = Math.min(p?.stock ?? 0, MAX_QTY);
    const capped = Math.max(0, Math.min(qty, cap));
    persistCart(
      cart
        .map((e) => (e.productId === productId ? { ...e, qty: capped } : e))
        .filter((e) => e.qty > 0),
    );
  }

  function toggleWish(productId: number) {
    setWishlist(toggleWishlist(slug, productId));
  }

  const cartLines = cart
    .map((e) => {
      const product = productById.get(e.productId);
      return product ? { ...e, product } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const subtotalIncl = cartLines.reduce(
    (s, l) => s + taxInclusiveUnit(l.product.price, l.product.taxRate) * l.qty,
    0,
  );
  const subtotalExcl = cartLines.reduce((s, l) => s + l.product.price * l.qty, 0);
  const cartCount = cartLines.reduce((s, l) => s + l.qty, 0);
  const freeShipRemaining =
    shop.freeShippingThreshold > 0 && shop.shippingFee > 0
      ? Math.max(0, shop.freeShippingThreshold - subtotalIncl)
      : 0;

  const wishSet = useMemo(() => new Set(wishlist), [wishlist]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = products.filter((p) => {
      if (activeCat === "wish") {
        if (!wishSet.has(p.id)) return false;
      } else if (activeCat !== "all" && p.categoryId !== activeCat) {
        return false;
      }
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.description ?? "").toLowerCase().includes(q)
      );
    });
    list = [...list];
    switch (sort) {
      case "price-asc":
        list.sort((a, b) => a.price - b.price);
        break;
      case "price-desc":
        list.sort((a, b) => b.price - a.price);
        break;
      case "new":
        list.sort((a, b) => b.createdAt - a.createdAt);
        break;
      default:
        break; // recommended = サーバの並び（sortNumber）
    }
    return list;
  }, [products, query, activeCat, sort, wishSet]);

  const recentProducts = recent
    .map((id) => productById.get(id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  return (
    <>
      {/* ツールバー */}
      <div className="mb-5 space-y-3">
        <div className="flex gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="商品を検索"
            className="flex-1"
          />
          <Select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="w-36 shrink-0"
          >
            <option value="recommended">おすすめ順</option>
            <option value="new">新着順</option>
            <option value="price-asc">価格が安い順</option>
            <option value="price-desc">価格が高い順</option>
          </Select>
        </div>
        <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
          <CatChip
            active={activeCat === "all"}
            onClick={() => setActiveCat("all")}
            label="すべて"
          />
          {wishlist.length > 0 && (
            <CatChip
              active={activeCat === "wish"}
              onClick={() => setActiveCat("wish")}
              label={`♥ お気に入り (${wishlist.length})`}
            />
          )}
          {categories.map((c) => (
            <CatChip
              key={c.id}
              active={activeCat === c.id}
              onClick={() => setActiveCat(c.id)}
              label={c.name}
            />
          ))}
        </div>
      </div>

      {/* 商品グリッド */}
      {filtered.length === 0 ? (
        <p className="rounded-xl border border-line bg-surface px-4 py-12 text-center text-sm text-muted">
          {activeCat === "wish"
            ? "お気に入りに登録した商品がありません。♡ をタップして追加できます。"
            : "商品が見つかりません。"}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
          {filtered.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              slug={slug}
              wished={wishSet.has(p.id)}
              onAdd={add}
              onToggleWish={toggleWish}
            />
          ))}
        </div>
      )}

      {/* 最近見た商品 */}
      {recentProducts.length > 0 && activeCat === "all" && !query && (
        <section className="mt-10">
          <h2 className="mb-3 text-sm font-semibold text-ink">最近見た商品</h2>
          <div className="no-scrollbar flex gap-3 overflow-x-auto pb-2">
            {recentProducts.map((p) => (
              <a
                key={p.id}
                href={`/shop/${slug}/item/${p.id}`}
                className="w-28 shrink-0"
              >
                <div className="aspect-square overflow-hidden rounded-xl border border-line bg-elevated">
                  {firstImage(p.imageUrls) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={firstImage(p.imageUrls)}
                      alt={p.name}
                      className="h-full w-full object-cover"
                    />
                  ) : null}
                </div>
                <div className="mt-1 line-clamp-2 text-xs text-muted">{p.name}</div>
                <div className="text-xs font-semibold tabular-nums text-ink">
                  {formatYen(taxInclusiveUnit(p.price, p.taxRate))}
                </div>
              </a>
            ))}
          </div>
        </section>
      )}

      {/* フローティング カートボタン */}
      {cartCount > 0 && !cartOpen && !checkoutOpen && (
        <button
          onClick={() => setCartOpen(true)}
          className="fixed bottom-5 left-1/2 z-40 flex -translate-x-1/2 animate-slide-up items-center gap-2 rounded-full bg-accent px-6 py-3 text-sm font-semibold text-accent-fg shadow-panel transition-transform hover:scale-105"
        >
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent-fg px-1.5 text-xs text-accent">
            {cartCount}
          </span>
          カートを見る・{formatYen(subtotalIncl)}
        </button>
      )}

      {/* トースト */}
      {toast && (
        <div className="fixed inset-x-0 top-4 z-[60] flex justify-center px-4">
          <div className="animate-slide-up rounded-full bg-ink/90 px-4 py-2 text-sm text-surface shadow-panel">
            {toast}
          </div>
        </div>
      )}

      {/* スライドインカート */}
      <CartDrawer
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        lines={cartLines}
        subtotalIncl={subtotalIncl}
        subtotalExcl={subtotalExcl}
        freeShipRemaining={freeShipRemaining}
        pointRatePercent={shop.pointRatePercent}
        onSetQty={setQty}
        onCheckout={() => {
          setCartOpen(false);
          setCheckoutOpen(true);
        }}
      />

      {/* チェックアウト */}
      <CheckoutForm
        open={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        slug={slug}
        shippingFee={shop.shippingFee}
        freeShippingThreshold={shop.freeShippingThreshold}
        subtotalIncl={subtotalIncl}
        items={cart}
        error={error}
        setError={setError}
        pending={pending}
        onSubmit={(payload) => {
          setError(null);
          startTransition(async () => {
            const res = await createCheckout(payload);
            if (res.ok) {
              clearCart(slug);
              window.location.href = res.url;
            } else {
              setError(res.error);
            }
          });
        }}
      />
    </>
  );
}

function CatChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all " +
        (active
          ? "border-accent bg-accent text-accent-fg shadow"
          : "border-line bg-surface text-muted hover:border-accent/40 hover:text-ink")
      }
    >
      {label}
    </button>
  );
}

function firstImage(raw: string | null): string | undefined {
  if (!raw) return undefined;
  try {
    const v = JSON.parse(raw);
    if (Array.isArray(v) && typeof v[0] === "string") return v[0];
  } catch {
    /* ignore */
  }
  return undefined;
}

function CheckoutForm({
  open,
  onClose,
  slug,
  shippingFee,
  freeShippingThreshold,
  subtotalIncl,
  items,
  error,
  setError,
  pending,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  slug: string;
  shippingFee: number;
  freeShippingThreshold: number;
  subtotalIncl: number;
  items: CartEntry[];
  error: string | null;
  setError: (s: string | null) => void;
  pending: boolean;
  onSubmit: (payload: {
    slug: string;
    items: CartEntry[];
    buyerName: string;
    buyerPhone: string | null;
    buyerEmail: string | null;
    buyerCode: string | null;
    fulfillment: "pickup" | "shipping";
    shippingAddress: string | null;
    note: string | null;
  }) => void;
}) {
  const [form, setForm] = useState({
    buyerName: "",
    buyerPhone: "",
    buyerEmail: "",
    buyerCode: "",
    fulfillment: "pickup" as "pickup" | "shipping",
    shippingAddress: "",
    note: "",
  });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const ship = effectiveShipping(
    form.fulfillment === "shipping" ? shippingFee : 0,
    subtotalIncl,
    freeShippingThreshold,
  );
  const total = subtotalIncl + ship;

  function submit() {
    if (!form.buyerName.trim()) {
      setError("お名前を入力してください");
      return;
    }
    if (form.fulfillment === "shipping" && !form.shippingAddress.trim()) {
      setError("配送先住所を入力してください");
      return;
    }
    onSubmit({
      slug,
      items,
      buyerName: form.buyerName.trim(),
      buyerPhone: form.buyerPhone.trim() || null,
      buyerEmail: form.buyerEmail.trim() || null,
      buyerCode: form.buyerCode.trim() || null,
      fulfillment: form.fulfillment,
      shippingAddress: form.shippingAddress.trim() || null,
      note: form.note.trim() || null,
    });
  }

  return (
    <Modal open={open} onClose={onClose} title="お客様情報の入力">
      <div className="space-y-4">
        <div>
          <Label>お名前（必須）</Label>
          <Input
            value={form.buyerName}
            onChange={(e) => set("buyerName", e.target.value)}
            placeholder="山田 太郎"
            maxLength={80}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>電話番号</Label>
            <Input
              type="tel"
              value={form.buyerPhone}
              onChange={(e) => set("buyerPhone", e.target.value)}
              placeholder="090-0000-0000"
              maxLength={40}
            />
          </div>
          <div>
            <Label>メール</Label>
            <Input
              type="email"
              value={form.buyerEmail}
              onChange={(e) => set("buyerEmail", e.target.value)}
              placeholder="taro@example.com"
              maxLength={120}
            />
          </div>
        </div>
        <div>
          <Label>会員番号（お持ちの方）</Label>
          <Input
            value={form.buyerCode}
            onChange={(e) => set("buyerCode", e.target.value)}
            placeholder="診察券・会員番号でポイントが貯まります"
            maxLength={60}
          />
        </div>
        <div>
          <Label>受け取り方法</Label>
          <Select
            value={form.fulfillment}
            onChange={(e) =>
              set("fulfillment", e.target.value as "pickup" | "shipping")
            }
          >
            <option value="pickup">店頭で受け取る（送料無料）</option>
            <option value="shipping">
              {freeShippingThreshold > 0 && subtotalIncl >= freeShippingThreshold
                ? "配送（送料無料）"
                : `配送（送料 ${formatYen(shippingFee)}）`}
            </option>
          </Select>
        </div>
        {form.fulfillment === "shipping" && (
          <div className="animate-slide-up">
            <Label>配送先住所</Label>
            <Textarea
              value={form.shippingAddress}
              onChange={(e) => set("shippingAddress", e.target.value)}
              placeholder="〒000-0000 東京都…"
              maxLength={300}
            />
          </div>
        )}
        <div>
          <Label>備考</Label>
          <Textarea
            value={form.note}
            onChange={(e) => set("note", e.target.value)}
            placeholder="ご要望があればご記入ください"
            maxLength={500}
            className="min-h-[60px]"
          />
        </div>

        <div className="space-y-1 rounded-xl border border-line bg-base/60 p-3 text-sm">
          <div className="flex justify-between text-muted">
            <span>小計（税込）</span>
            <span className="tabular-nums">{formatYen(subtotalIncl)}</span>
          </div>
          <div className="flex justify-between text-muted">
            <span>送料</span>
            <span className="tabular-nums">
              {ship > 0 ? formatYen(ship) : "無料"}
            </span>
          </div>
          <div className="flex justify-between border-t border-line pt-1 font-semibold text-ink">
            <span>お支払い合計</span>
            <span className="tabular-nums">{formatYen(total)}</span>
          </div>
        </div>

        {error && (
          <p className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
            {error}
          </p>
        )}

        <Button className="w-full" onClick={submit} disabled={pending}>
          {pending ? "決済ページへ移動中…" : "決済へ進む（Stripe）"}
        </Button>
        <p className="text-center text-xs text-faint">
          「決済へ進む」を押すと、安全な Stripe の決済ページへ移動します。
        </p>
      </div>
    </Modal>
  );
}
