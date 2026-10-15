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
import { Reveal } from "@/feature/storefront/components/Reveal";
import { BenefitIcon } from "@/feature/storefront/components/BenefitIcon";
import { ProductImagePlaceholder } from "@/feature/storefront/components/ProductImagePlaceholder";
import {
  CartIcon,
  CheckIcon,
  LeafIcon,
  PlusIcon,
  SearchIcon,
} from "@/feature/storefront/components/icons";
import { storeBenefits } from "@/feature/storefront/lib/benefits";
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

  // カテゴリのタイル: 商品があるカテゴリだけ。写真はそのカテゴリの最初の商品写真。
  const categoryTiles = useMemo(
    () =>
      categories
        .filter((c) => (categoryCounts.get(c.id) ?? 0) > 0)
        .map((c) => ({
          ...c,
          count: categoryCounts.get(c.id) ?? 0,
          image:
            products
              .filter((p) => p.categoryId === c.id)
              .map((p) => parseImageUrls(p.imageUrls)[0])
              .find(Boolean) ?? null,
        })),
    [categories, categoryCounts, products],
  );
  const guide = storeBenefits(shop).slice(0, 4);

  function pickCategory(id: number) {
    setFilter(id);
    document.getElementById("products")?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <>
      {/* カテゴリから探す */}
      {showSections && categoryTiles.length >= 2 && (
        <Reveal className="mb-20 sm:mb-28">
          <SectionHeading eyebrow="Category" title="カテゴリから探す" />
          <div className="no-scrollbar -mx-4 flex gap-5 overflow-x-auto px-4 pb-2 sm:mx-0 sm:flex-wrap sm:gap-8 sm:px-0">
            {categoryTiles.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => pickCategory(c.id)}
                className="group w-24 shrink-0 text-center sm:w-32"
              >
                <span className="block aspect-square overflow-hidden rounded-full border border-line bg-elevated ring-accent/30 ring-offset-2 ring-offset-base transition-all duration-500 ease-silk group-hover:ring-2">
                  {c.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={c.image}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-700 ease-silk group-hover:scale-110"
                    />
                  ) : (
                    <ProductImagePlaceholder name={c.name} size="sm" />
                  )}
                </span>
                <span className="mt-2.5 block text-[11px] leading-snug tracking-normal text-ink transition-colors [word-break:auto-phrase] group-hover:text-accent sm:text-xs">
                  {c.name}
                </span>
                <span className="block text-[10px] text-faint">{c.count}点</span>
              </button>
            ))}
          </div>
        </Reveal>
      )}

      {/* スタッフのおすすめ */}
      {showSections && featured.length > 0 && (
        <section id="picks" className="mb-20 scroll-mt-24 sm:mb-28">
          <Reveal>
            <SectionHeading
              eyebrow="Staff Picks"
              title="スタッフのおすすめ"
              lead="施術者が実際に使っている・患者さまに勧めているアイテムです。"
            />
          </Reveal>
          <div className="grid gap-6 sm:grid-cols-3 sm:gap-5">
            {featured.map((p, i) => (
              <Reveal key={p.id} delay={i * 120} className="h-full">
                <FeaturedCard product={p} slug={slug} onAdd={add} />
              </Reveal>
            ))}
          </div>
        </section>
      )}

      {/* 人気ランキング */}
      {showSections && ranked.length > 0 && (
        <section className="mb-20 sm:mb-28">
          <Reveal>
            <SectionHeading
              eyebrow="Ranking"
              title="人気ランキング"
              lead="直近3ヶ月でよく選ばれている商品。"
            />
          </Reveal>
          <div className="no-scrollbar -mx-4 flex gap-5 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0">
            {ranked.map((p, i) => (
              <Reveal key={p.id} delay={i * 120} className="w-[64%] shrink-0 sm:w-auto">
                <RankedCard product={p} slug={slug} onAdd={add} />
              </Reveal>
            ))}
          </div>
        </section>
      )}

      {/* 商品一覧 */}
      <section id="products" className="scroll-mt-24">
        <SectionHeading
          eyebrow="All Items"
          title="商品一覧"
          lead={`${products.length}点のアイテム`}
        />

        <div className="mb-8 space-y-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <SearchIcon
                size={16}
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-faint"
              />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="商品名・キーワードで検索"
                aria-label="商品を検索"
                className="h-11 rounded-full bg-surface pl-11"
              />
            </div>
            {/* Select は w-full 固定なので、幅は外側の箱で決める */}
            <div className="w-[8.5rem] shrink-0 sm:w-40">
              <Select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                aria-label="並び替え"
                className="h-11 rounded-full bg-surface pl-4"
              >
                <option value="recommended">おすすめ順</option>
                <option value="popular">人気順</option>
                <option value="new">新着順</option>
                <option value="price-asc">価格が安い順</option>
                <option value="price-desc">価格が高い順</option>
              </Select>
            </div>
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
          <div className="rounded-[1.5rem] border border-dashed border-line bg-surface/60 px-4 py-16 text-center">
            <LeafIcon size={28} className="mx-auto text-accent/50" />
            <p className="mt-3 text-sm text-muted">
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
                className="mt-4 rounded-full border border-accent/40 px-4 py-1.5 text-xs text-accent-hover transition-colors hover:bg-accent hover:text-accent-fg"
              >
                条件をクリア
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-3 gap-y-9 sm:grid-cols-3 sm:gap-x-5 sm:gap-y-12 lg:grid-cols-4">
            {filtered.map((p, i) => (
              <Reveal key={p.id} delay={(i % 4) * 80} className="h-full">
                <ProductCard
                  product={p}
                  slug={slug}
                  wished={wishSet.has(p.id)}
                  pointRatePercent={shop.pointRatePercent}
                  onAdd={add}
                  onToggleWish={toggleWish}
                />
              </Reveal>
            ))}
          </div>
        )}
      </section>

      {/* ご利用ガイド（送料・ポイント・店頭受取） */}
      {showSections && guide.length > 0 && (
        <Reveal className="mt-24 sm:mt-32">
          <section className="grain relative overflow-hidden rounded-[2rem] bg-accent px-6 py-12 text-accent-fg sm:px-12 sm:py-16">
            <LeafIcon
              size={260}
              strokeWidth={0.5}
              className="pointer-events-none absolute -right-12 -top-10 animate-sway text-accent-fg/10"
            />
            <p className="relative font-accent text-lg italic tracking-[0.3em] text-accent-fg/70">
              Shopping Guide
            </p>
            <h2 className="relative mt-2 font-display text-2xl font-semibold tracking-[0.1em] sm:text-3xl">
              安心してお買い物いただくために
            </h2>
            <ul
              className={
                "relative mt-10 grid gap-8 sm:grid-cols-2 " +
                (guide.length >= 4 ? "lg:grid-cols-4" : "lg:grid-cols-3")
              }
            >
              {guide.map((b) => (
                <li key={b.kind}>
                  <span className="flex h-12 w-12 items-center justify-center rounded-full border border-accent-fg/30">
                    <BenefitIcon kind={b.kind} size={20} />
                  </span>
                  <h3 className="mt-4 text-[15px] font-semibold tracking-wider">{b.label}</h3>
                  <p className="mt-2 text-xs leading-[1.9] text-accent-fg/75">{b.detail}</p>
                </li>
              ))}
            </ul>
          </section>
        </Reveal>
      )}

      {/* 最近見た商品 */}
      {showSections && recentProducts.length > 0 && (
        <Reveal className="mt-20 sm:mt-24">
          <SectionHeading eyebrow="Recently Viewed" title="最近見た商品" />
          <div className="no-scrollbar -mx-4 flex gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
            {recentProducts.map((p) => {
              const img = parseImageUrls(p.imageUrls)[0];
              return (
                <a
                  key={p.id}
                  href={`/shop/${slug}/item/${p.id}`}
                  className="group w-28 shrink-0 sm:w-32"
                >
                  <div className="aspect-[4/5] overflow-hidden rounded-2xl bg-elevated">
                    {img ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={img}
                        alt={p.name}
                        className="h-full w-full object-cover transition-transform duration-700 ease-silk group-hover:scale-105"
                      />
                    ) : (
                      <ProductImagePlaceholder name={p.name} size="sm" />
                    )}
                  </div>
                  <div className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted group-hover:text-ink">
                    {p.name}
                  </div>
                  <div className="text-xs font-semibold tabular-nums text-ink">
                    {formatYen(taxInclusiveUnit(p.price, p.taxRate))}
                  </div>
                </a>
              );
            })}
          </div>
        </Reveal>
      )}

      {/* フローティング カートボタン */}
      {cartCount > 0 && !cartOpen && (
        <div
          className="pointer-events-none fixed inset-x-0 bottom-5 z-40 flex justify-center px-4 sm:justify-end sm:px-6"
          style={{ marginBottom: "env(safe-area-inset-bottom)" }}
        >
          <button
            onClick={() => setCartOpen(true)}
            className="pointer-events-auto flex animate-rise items-center gap-3 rounded-full bg-ink py-2 pl-2 pr-6 text-sm text-surface shadow-[0_18px_40px_-16px_rgba(45,51,41,0.75)] transition-transform duration-500 ease-silk hover:-translate-y-0.5"
          >
            <span className="relative flex h-10 w-10 items-center justify-center rounded-full bg-accent text-accent-fg">
              <CartIcon size={18} />
              <span
                key={cartCount}
                className="absolute -right-1 -top-1 flex h-5 min-w-5 animate-pop items-center justify-center rounded-full bg-clay px-1 text-[10px] font-bold text-white"
              >
                {cartCount}
              </span>
            </span>
            <span className="font-medium tracking-wider">カートを見る</span>
            <span className="tabular-nums text-surface/75">{formatYen(subtotalIncl)}</span>
          </button>
        </div>
      )}

      {/* トースト */}
      {toast && (
        <div className="pointer-events-none fixed inset-x-0 top-24 z-[60] flex justify-center px-4">
          <div className="flex animate-rise items-center gap-2 rounded-full bg-ink/95 px-5 py-2.5 text-[13px] text-surface shadow-panel backdrop-blur">
            <CheckIcon size={15} className="shrink-0 text-accent-soft" />
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
  eyebrow,
  title,
  lead,
}: {
  eyebrow: string;
  title: string;
  lead?: string;
}) {
  return (
    <div className="mb-7 sm:mb-9">
      <p className="font-accent text-md italic tracking-[0.28em] text-accent">{eyebrow}</p>
      <h2 className="mt-1 font-display text-[1.55rem] font-semibold tracking-[0.1em] text-ink sm:text-[2rem]">
        {title}
      </h2>
      {lead && <p className="mt-2 text-xs leading-relaxed text-muted sm:text-[13px]">{lead}</p>}
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
      ? "border-danger bg-danger text-white"
      : "border-ink bg-ink text-surface";
  const idleCls =
    tone === "danger"
      ? "border-danger/40 bg-surface/60 text-danger hover:bg-danger/10"
      : "border-line bg-surface/60 text-muted hover:border-ink/30 hover:text-ink";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        "shrink-0 whitespace-nowrap rounded-full border px-4 py-2 text-xs tracking-wide transition-all duration-300 " +
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
  const href = `/shop/${slug}/item/${p.id}`;
  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-[1.5rem] border border-line/70 bg-surface shadow-panel">
      <a href={href} className="relative block aspect-[4/3] overflow-hidden bg-elevated sm:aspect-[4/5]">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={img}
            alt={p.name}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-[1.4s] ease-silk group-hover:scale-[1.06]"
          />
        ) : (
          <ProductImagePlaceholder name={p.name} />
        )}
        <span className="absolute left-3 top-3 rounded-full bg-surface/90 px-3 py-1 font-accent text-xs italic tracking-[0.2em] text-accent backdrop-blur">
          Staff&apos;s Choice
        </span>
      </a>
      <div className="flex flex-1 flex-col p-5">
        {p.featuredComment && (
          <p className="relative pl-6 font-display text-[13px] leading-[1.95] text-ink/90">
            <span
              aria-hidden
              className="absolute -top-1.5 left-0 font-accent text-4xl leading-none text-clay"
            >
              “
            </span>
            {p.featuredComment}
          </p>
        )}
        <div className="mt-auto pt-5">
          <a
            href={href}
            className="line-clamp-1 text-sm font-medium text-ink transition-colors hover:text-accent"
          >
            {p.name}
          </a>
          <div className="mt-2 flex items-center justify-between gap-2">
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
              className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full bg-accent px-4 text-[11px] font-semibold tracking-wider text-accent-fg transition-colors duration-300 hover:bg-accent-hover disabled:opacity-50"
            >
              {sold ? "売り切れ" : (
                <>
                  <PlusIcon size={13} />
                  カートへ
                </>
              )}
            </button>
          </div>
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
  const href = `/shop/${slug}/item/${p.id}`;
  return (
    <article className="group">
      <div className="relative overflow-hidden rounded-[1.25rem] bg-elevated">
        <a href={href} className="block aspect-square">
          {img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={img}
              alt={p.name}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-[1.4s] ease-silk group-hover:scale-[1.06]"
            />
          ) : (
            <ProductImagePlaceholder name={p.name} />
          )}
        </a>
        {/* 順位（写真の角を切り欠いたように見せる） */}
        <span className="pointer-events-none absolute bottom-0 left-0 rounded-tr-[1.25rem] bg-base px-4 pb-1 pt-2.5 font-accent text-[2.6rem] font-semibold italic leading-none text-clay lining-nums">
          {String(p.salesRank ?? 0).padStart(2, "0")}
        </span>
      </div>
      <div className="mt-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <a
            href={href}
            className="line-clamp-2 text-sm font-medium leading-relaxed text-ink transition-colors hover:text-accent"
          >
            {p.name}
          </a>
          <PriceTag
            size="sm"
            className="mt-0.5"
            price={p.price}
            compareAtPrice={p.compareAtPrice}
            taxRate={p.taxRate}
          />
        </div>
        <button
          type="button"
          disabled={sold}
          onClick={() => onAdd(p.id)}
          aria-label={sold ? "売り切れ" : `${p.name}をカートに入れる`}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-accent/40 text-accent-hover transition-all duration-300 hover:rotate-90 hover:bg-accent hover:text-accent-fg disabled:opacity-40"
        >
          <PlusIcon size={16} />
        </button>
      </div>
    </article>
  );
}
