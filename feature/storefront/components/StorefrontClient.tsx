"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Input, Select } from "@/components/ui/Input";
import type {
  StorefrontData,
  StorefrontProduct,
} from "@/feature/storefront/services/getStorefront";
import { ProductCard } from "@/feature/storefront/components/ProductCard";
import { CartDrawer } from "@/feature/storefront/components/CartDrawer";
import { PriceTag } from "@/feature/storefront/components/PriceTag";
import {
  CartIcon,
  SearchIcon,
  SparkleIcon,
  TrophyIcon,
  ClockIcon,
} from "@/feature/storefront/components/icons";
import {
  readCart,
  writeCart,
  OPEN_CART_EVENT,
  type CartEntry,
} from "@/feature/storefront/lib/cart";
import { readWishlist, toggleWishlist } from "@/feature/storefront/lib/wishlist";
import { readRecentlyViewed } from "@/feature/storefront/lib/recentlyViewed";
import { formatYen, taxInclusiveUnit, parseImageUrls } from "@/helper/utils/retail";

type SortKey = "recommended" | "popular" | "new" | "price-asc" | "price-desc";
type Filter = "all" | "wish" | "sale" | number;

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
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<SortKey>("recommended");
  const [inStockOnly, setInStockOnly] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
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

  // ヘッダーのカートボタン → ドロワーを開く（preventDefault で「処理済み」を伝える）
  useEffect(() => {
    const onOpen = (e: Event) => {
      e.preventDefault();
      setCartOpen(true);
    };
    window.addEventListener(OPEN_CART_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_CART_EVENT, onOpen);
  }, []);

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

  /** カートに1点追加。追加できなければ false（上限・在庫切れ）。 */
  function add(productId: number): boolean {
    const p = productById.get(productId);
    if (!p || p.stock <= 0) return false;
    const cap = Math.min(p.stock, MAX_QTY);
    const found = cart.find((e) => e.productId === productId);
    const current = found?.qty ?? 0;
    if (current >= cap) {
      flashToast(current >= MAX_QTY ? "数量の上限です" : "在庫の上限です");
      return false;
    }
    // 既存オブジェクトを破壊せず、新しい配列・新しい要素を作る（state の不変性）
    const next = found
      ? cart.map((e) =>
          e.productId === productId ? { ...e, qty: current + 1 } : e,
        )
      : [...cart, { productId, qty: 1 }];
    persistCart(next);
    flashToast(`「${p.name}」をカートに追加しました`);
    return true;
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
    const next = toggleWishlist(slug, productId);
    setWishlist(next);
    flashToast(
      next.includes(productId)
        ? "お気に入りに追加しました"
        : "お気に入りから削除しました",
    );
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
  const inCart = useMemo(() => new Set(cart.map((e) => e.productId)), [cart]);

  const categoryCounts = useMemo(() => {
    const m = new Map<number, number>();
    for (const p of products) {
      if (p.categoryId != null) m.set(p.categoryId, (m.get(p.categoryId) ?? 0) + 1);
    }
    return m;
  }, [products]);
  const saleCount = useMemo(
    () => products.filter((p) => p.discountPercent > 0).length,
    [products],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = products.filter((p) => {
      if (filter === "wish") {
        if (!wishSet.has(p.id)) return false;
      } else if (filter === "sale") {
        if (p.discountPercent <= 0) return false;
      } else if (filter !== "all" && p.categoryId !== filter) {
        return false;
      }
      if (inStockOnly && p.stock <= 0) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.tagline ?? "").toLowerCase().includes(q) ||
        (p.description ?? "").toLowerCase().includes(q)
      );
    });
    list = [...list];
    switch (sort) {
      case "popular":
        list.sort((a, b) => b.soldCount - a.soldCount || b.ratingCount - a.ratingCount);
        break;
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
  }, [products, query, filter, sort, inStockOnly, wishSet]);

  const featured = useMemo(
    () => products.filter((p) => p.isFeatured).slice(0, 3),
    [products],
  );
  const ranked = useMemo(
    () =>
      products
        .filter((p) => p.salesRank != null)
        .sort((a, b) => (a.salesRank ?? 99) - (b.salesRank ?? 99)),
    [products],
  );
  // 「あわせて買いたい」: カートに無い在庫ありの商品。カート内商品と同カテゴリを優先し、
  // 次におすすめ・人気を並べる。
  const suggestions = useMemo(() => {
    if (cart.length === 0) return [] as StorefrontProduct[];
    const cats = new Set(
      cart
        .map((e) => productById.get(e.productId)?.categoryId)
        .filter((c): c is number => c != null),
    );
    const score = (p: StorefrontProduct) =>
      (p.categoryId != null && cats.has(p.categoryId) ? 4 : 0) +
      (p.isFeatured ? 2 : 0) +
      (p.salesRank != null ? 1 : 0);
    return products
      .filter((p) => !inCart.has(p.id) && p.stock > 0)
      .sort((a, b) => score(b) - score(a))
      .slice(0, 4);
  }, [cart, inCart, products, productById]);

  const recentProducts = recent
    .map((id) => productById.get(id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  const showSections = filter === "all" && !query.trim();

  return (
    <>
      {/* スタッフのおすすめ */}
      {showSections && featured.length > 0 && (
        <section className="mb-10">
          <SectionHeading
            icon={<SparkleIcon size={16} />}
            eyebrow="Staff Picks"
            title="スタッフのおすすめ"
            lead="施術者が実際に使っている・患者さまに勧めているアイテムです。"
          />
          <div className="grid gap-3 sm:grid-cols-3">
            {featured.map((p) => (
              <FeaturedCard
                key={p.id}
                product={p}
                slug={slug}
                onAdd={add}
              />
            ))}
          </div>
        </section>
      )}

      {/* 人気ランキング */}
      {showSections && ranked.length > 0 && (
        <section className="mb-10">
          <SectionHeading
            icon={<TrophyIcon size={16} />}
            eyebrow="Ranking"
            title="人気ランキング"
            lead="直近3ヶ月でよく選ばれている商品。"
          />
          <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
            {ranked.map((p) => (
              <RankedCard key={p.id} product={p} slug={slug} onAdd={add} />
            ))}
          </div>
        </section>
      )}

      {/* 商品一覧 */}
      <section id="products" className="scroll-mt-20">
        <SectionHeading
          eyebrow="Products"
          title="商品一覧"
          lead={`${products.length}点の商品`}
        />

        <div className="mb-4 space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <SearchIcon
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
              />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="商品名・キーワードで検索"
                aria-label="商品を検索"
                className="pl-9"
              />
            </div>
            <Select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              aria-label="並び替え"
              className="w-36 shrink-0"
            >
              <option value="recommended">おすすめ順</option>
              <option value="popular">人気順</option>
              <option value="new">新着順</option>
              <option value="price-asc">価格が安い順</option>
              <option value="price-desc">価格が高い順</option>
            </Select>
          </div>
          <div className="no-scrollbar -mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
            <Chip
              active={filter === "all"}
              onClick={() => setFilter("all")}
              label="すべて"
            />
            {wishlist.length > 0 && (
              <Chip
                active={filter === "wish"}
                onClick={() => setFilter("wish")}
                label={`♥ お気に入り (${wishlist.length})`}
              />
            )}
            {saleCount > 0 && (
              <Chip
                active={filter === "sale"}
                onClick={() => setFilter("sale")}
                label={`セール (${saleCount})`}
                tone="danger"
              />
            )}
            {categories.map((c) => (
              <Chip
                key={c.id}
                active={filter === c.id}
                onClick={() => setFilter(c.id)}
                label={`${c.name}${categoryCounts.has(c.id) ? ` (${categoryCounts.get(c.id)})` : ""}`}
              />
            ))}
            <label className="ml-auto flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap pl-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={inStockOnly}
                onChange={(e) => setInStockOnly(e.target.checked)}
                className="h-3.5 w-3.5 accent-accent"
              />
              在庫ありのみ
            </label>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-line bg-surface px-4 py-14 text-center">
            <p className="text-sm text-muted">
              {filter === "wish"
                ? "お気に入りに登録した商品がありません。♡ をタップして追加できます。"
                : "条件に合う商品が見つかりませんでした。"}
            </p>
            {(query || filter !== "all" || inStockOnly) && (
              <button
                onClick={() => {
                  setQuery("");
                  setFilter("all");
                  setInStockOnly(false);
                }}
                className="mt-3 text-xs text-accent hover:underline"
              >
                条件をクリア
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
            {filtered.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                slug={slug}
                wished={wishSet.has(p.id)}
                pointRatePercent={shop.pointRatePercent}
                onAdd={add}
                onToggleWish={toggleWish}
              />
            ))}
          </div>
        )}
      </section>

      {/* 最近見た商品 */}
      {showSections && recentProducts.length > 0 && (
        <section className="mt-12">
          <SectionHeading
            icon={<ClockIcon size={16} />}
            eyebrow="Recently Viewed"
            title="最近見た商品"
          />
          <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
            {recentProducts.map((p) => {
              const img = parseImageUrls(p.imageUrls)[0];
              return (
                <a
                  key={p.id}
                  href={`/shop/${slug}/item/${p.id}`}
                  className="w-28 shrink-0"
                >
                  <div className="aspect-square overflow-hidden rounded-xl border border-line bg-elevated">
                    {img ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={img} alt={p.name} className="h-full w-full object-cover" />
                    ) : null}
                  </div>
                  <div className="mt-1 line-clamp-2 text-xs text-muted">{p.name}</div>
                  <div className="text-xs font-semibold tabular-nums text-ink">
                    {formatYen(taxInclusiveUnit(p.price, p.taxRate))}
                  </div>
                </a>
              );
            })}
          </div>
        </section>
      )}

      {/* フローティング カートボタン */}
      {cartCount > 0 && !cartOpen && (
        <button
          onClick={() => setCartOpen(true)}
          className="fixed bottom-5 left-1/2 z-40 flex -translate-x-1/2 animate-slide-up items-center gap-2 rounded-full bg-accent px-6 py-3 text-sm font-semibold text-accent-fg shadow-panel transition-transform hover:scale-105 sm:left-auto sm:right-6 sm:translate-x-0"
          style={{ marginBottom: "env(safe-area-inset-bottom)" }}
        >
          <CartIcon size={18} />
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent-fg px-1.5 text-xs text-accent">
            {cartCount}
          </span>
          カートを見る・{formatYen(subtotalIncl)}
        </button>
      )}

      {/* トースト */}
      {toast && (
        <div className="pointer-events-none fixed inset-x-0 top-20 z-[60] flex justify-center px-4">
          <div className="animate-slide-up rounded-full bg-ink/90 px-4 py-2 text-sm text-surface shadow-panel">
            {toast}
          </div>
        </div>
      )}

      {/* スライドインカート */}
      <CartDrawer
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        slug={slug}
        lines={cartLines}
        subtotalIncl={subtotalIncl}
        subtotalExcl={subtotalExcl}
        freeShipRemaining={freeShipRemaining}
        pointRatePercent={shop.pointRatePercent}
        suggestions={suggestions}
        onSetQty={setQty}
        onAdd={add}
      />
    </>
  );
}

function SectionHeading({
  icon,
  eyebrow,
  title,
  lead,
}: {
  icon?: React.ReactNode;
  eyebrow: string;
  title: string;
  lead?: string;
}) {
  return (
    <div className="mb-4">
      <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.3em] text-accent">
        {icon}
        {eyebrow}
      </p>
      <h2 className="mt-1 font-display text-xl tracking-wide text-ink sm:text-2xl">
        {title}
      </h2>
      {lead && <p className="mt-1 text-xs text-muted">{lead}</p>}
    </div>
  );
}

function Chip({
  active,
  onClick,
  label,
  tone,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  tone?: "danger";
}) {
  const activeCls =
    tone === "danger"
      ? "border-danger bg-danger text-white shadow"
      : "border-accent bg-accent text-accent-fg shadow";
  const idleCls =
    tone === "danger"
      ? "border-danger/40 bg-surface text-danger hover:bg-danger/10"
      : "border-line bg-surface text-muted hover:border-accent/40 hover:text-ink";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        "shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all " +
        (active ? activeCls : idleCls)
      }
    >
      {label}
    </button>
  );
}

function FeaturedCard({
  product: p,
  slug,
  onAdd,
}: {
  product: StorefrontProduct;
  slug: string;
  onAdd: (id: number) => boolean;
}) {
  const img = parseImageUrls(p.imageUrls)[0];
  const sold = p.stock <= 0;
  return (
    <article className="flex gap-3 rounded-2xl border border-accent/30 bg-surface p-3 shadow-panel">
      <a
        href={`/shop/${slug}/item/${p.id}`}
        className="h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-elevated sm:h-28 sm:w-28"
      >
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt={p.name} className="h-full w-full object-cover" />
        ) : null}
      </a>
      <div className="flex min-w-0 flex-1 flex-col">
        <a
          href={`/shop/${slug}/item/${p.id}`}
          className="line-clamp-2 text-sm font-semibold leading-snug text-ink hover:text-accent"
        >
          {p.name}
        </a>
        {p.featuredComment && (
          <p className="mt-1 line-clamp-3 text-[11px] leading-relaxed text-muted">
            “{p.featuredComment}”
          </p>
        )}
        <div className="mt-auto flex items-end justify-between gap-2 pt-1.5">
          <PriceTag
            size="sm"
            price={p.price}
            compareAtPrice={p.compareAtPrice}
            taxRate={p.taxRate}
          />
          <button
            type="button"
            disabled={sold}
            onClick={() => onAdd(p.id)}
            className="h-8 shrink-0 rounded-lg bg-accent px-3 text-[11px] font-semibold text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {sold ? "売り切れ" : "カートへ"}
          </button>
        </div>
      </div>
    </article>
  );
}

function RankedCard({
  product: p,
  slug,
  onAdd,
}: {
  product: StorefrontProduct;
  slug: string;
  onAdd: (id: number) => boolean;
}) {
  const img = parseImageUrls(p.imageUrls)[0];
  const sold = p.stock <= 0;
  const rankCls =
    p.salesRank === 1
      ? "bg-accent text-accent-fg"
      : p.salesRank === 2
        ? "bg-ink text-surface"
        : "bg-elevated text-ink";
  return (
    <article className="relative w-40 shrink-0 overflow-hidden rounded-2xl border border-line bg-surface shadow-panel sm:w-44">
      <span
        className={`absolute left-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold shadow ${rankCls}`}
      >
        {p.salesRank}
      </span>
      <a
        href={`/shop/${slug}/item/${p.id}`}
        className="block aspect-square overflow-hidden bg-elevated"
      >
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt={p.name} className="h-full w-full object-cover" />
        ) : null}
      </a>
      <div className="p-2.5">
        <a
          href={`/shop/${slug}/item/${p.id}`}
          className="line-clamp-2 text-xs font-medium leading-snug text-ink hover:text-accent"
        >
          {p.name}
        </a>
        <PriceTag
          size="sm"
          className="mt-1"
          price={p.price}
          compareAtPrice={p.compareAtPrice}
          taxRate={p.taxRate}
        />
        <button
          type="button"
          disabled={sold}
          onClick={() => onAdd(p.id)}
          className="mt-2 h-8 w-full rounded-lg border border-accent/40 bg-accent-soft text-[11px] font-semibold text-accent-fg transition-colors hover:bg-accent disabled:opacity-50"
        >
          {sold ? "売り切れ" : "カートに入れる"}
        </button>
      </div>
    </article>
  );
}
