"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input, Label, Textarea, Select } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import type { StorefrontData } from "@/feature/storefront/services/getStorefront";
import { createCheckout } from "@/feature/storefront/actions/checkoutActions";
import {
  readCart,
  writeCart,
  clearCart,
  type CartEntry,
} from "@/feature/storefront/lib/cart";
import {
  formatYen,
  taxInclusiveUnit,
  parseImageUrls,
} from "@/helper/utils/retail";

export function StorefrontClient({
  data,
  openCartInitially,
}: {
  data: StorefrontData;
  openCartInitially?: boolean;
}) {
  const { shop, products, categories } = data;
  const [cart, setCart] = useState<CartEntry[]>([]);
  const [query, setQuery] = useState("");
  const [activeCat, setActiveCat] = useState<number | "all">("all");
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // localStorage からカートを読み込み
  useEffect(() => {
    setCart(readCart(shop.storeSlug!));
    if (openCartInitially) setCartOpen(true);
  }, [shop.storeSlug, openCartInitially]);

  const productById = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products],
  );

  function persist(next: CartEntry[]) {
    setCart(next);
    writeCart(shop.storeSlug!, next);
  }

  function add(productId: number) {
    const p = productById.get(productId);
    if (!p || p.stock <= 0) return;
    const next = [...cart];
    const found = next.find((e) => e.productId === productId);
    const current = found?.qty ?? 0;
    if (current >= p.stock) return; // 在庫上限
    if (found) found.qty = current + 1;
    else next.push({ productId, qty: 1 });
    persist(next);
    setCartOpen(true);
  }

  function setQty(productId: number, qty: number) {
    const p = productById.get(productId);
    const capped = Math.max(0, Math.min(qty, p?.stock ?? 0));
    const next = cart
      .map((e) => (e.productId === productId ? { ...e, qty: capped } : e))
      .filter((e) => e.qty > 0);
    persist(next);
  }

  const cartLines = cart
    .map((e) => {
      const p = productById.get(e.productId);
      if (!p) return null;
      return { ...e, product: p };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const subtotalIncl = cartLines.reduce(
    (s, l) => s + taxInclusiveUnit(l.product.price, l.product.taxRate) * l.qty,
    0,
  );
  const cartCount = cartLines.reduce((s, l) => s + l.qty, 0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (activeCat !== "all" && p.categoryId !== activeCat) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.description ?? "").toLowerCase().includes(q)
      );
    });
  }, [products, query, activeCat]);

  return (
    <>
      {/* カテゴリ + 検索 */}
      <div className="mb-5 space-y-3">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="商品を検索"
        />
        {categories.length > 0 && (
          <div className="no-scrollbar flex gap-2 overflow-x-auto">
            <CatChip
              active={activeCat === "all"}
              onClick={() => setActiveCat("all")}
              label="すべて"
            />
            {categories.map((c) => (
              <CatChip
                key={c.id}
                active={activeCat === c.id}
                onClick={() => setActiveCat(c.id)}
                label={c.name}
              />
            ))}
          </div>
        )}
      </div>

      {/* 商品グリッド */}
      {filtered.length === 0 ? (
        <p className="rounded-xl border border-line bg-surface px-4 py-10 text-center text-sm text-muted">
          商品が見つかりません。
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {filtered.map((p) => {
            const img = parseImageUrls(p.imageUrls)[0];
            const sold = p.stock <= 0;
            return (
              <div
                key={p.id}
                className="flex flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-panel"
              >
                <a
                  href={`/shop/${shop.storeSlug}/item/${p.id}`}
                  className="block aspect-square bg-elevated"
                >
                  {img ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={img}
                      alt={p.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-faint">
                      No Image
                    </div>
                  )}
                </a>
                <div className="flex flex-1 flex-col p-3">
                  <a
                    href={`/shop/${shop.storeSlug}/item/${p.id}`}
                    className="line-clamp-2 text-sm font-medium text-ink hover:text-accent"
                  >
                    {p.name}
                  </a>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-base font-semibold tabular-nums text-ink">
                      {formatYen(taxInclusiveUnit(p.price, p.taxRate))}
                    </span>
                    {sold && (
                      <Badge className="border-line bg-elevated text-muted">
                        在庫切れ
                      </Badge>
                    )}
                  </div>
                  <Button
                    size="sm"
                    className="mt-2"
                    disabled={sold}
                    onClick={() => add(p.id)}
                  >
                    {sold ? "売り切れ" : "カートに入れる"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* カートを開くフローティングボタン */}
      {cartCount > 0 && !cartOpen && !checkoutOpen && (
        <button
          onClick={() => setCartOpen(true)}
          className="fixed bottom-5 left-1/2 z-40 -translate-x-1/2 rounded-full bg-accent px-6 py-3 text-sm font-semibold text-accent-fg shadow-panel"
        >
          カートを見る（{cartCount}点 / {formatYen(subtotalIncl)}）
        </button>
      )}

      {/* カート */}
      <Modal
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        title={`カート（${cartCount}点）`}
      >
        {cartLines.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">
            カートは空です。
          </p>
        ) : (
          <div className="space-y-4">
            <ul className="divide-y divide-line/70">
              {cartLines.map((l) => (
                <li key={l.productId} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-ink">
                      {l.product.name}
                    </div>
                    <div className="text-xs text-muted tabular-nums">
                      {formatYen(
                        taxInclusiveUnit(l.product.price, l.product.taxRate),
                      )}
                      （税込）
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setQty(l.productId, l.qty - 1)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-line text-muted hover:bg-elevated"
                    >
                      −
                    </button>
                    <span className="w-7 text-center text-sm tabular-nums">
                      {l.qty}
                    </span>
                    <button
                      onClick={() => setQty(l.productId, l.qty + 1)}
                      disabled={l.qty >= l.product.stock}
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-line text-muted hover:bg-elevated disabled:opacity-40"
                    >
                      ＋
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between border-t border-line pt-3 text-sm">
              <span className="text-muted">小計（税込）</span>
              <span className="text-lg font-semibold tabular-nums text-ink">
                {formatYen(subtotalIncl)}
              </span>
            </div>
            {shop.pointRatePercent > 0 && (
              <p className="text-xs text-accent">
                ご購入で約 {Math.floor((cartLines.reduce((s, l) => s + l.product.price * l.qty, 0) * shop.pointRatePercent) / 100)} ポイント付与
              </p>
            )}
            <Button
              className="w-full"
              onClick={() => {
                setCartOpen(false);
                setCheckoutOpen(true);
              }}
            >
              購入手続きへ進む
            </Button>
          </div>
        )}
      </Modal>

      {/* チェックアウトフォーム */}
      <CheckoutForm
        open={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        slug={shop.storeSlug!}
        shippingFee={shop.shippingFee}
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
              clearCart(shop.storeSlug!);
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
        "shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition-colors " +
        (active
          ? "border-accent bg-accent text-accent-fg"
          : "border-line bg-surface text-muted hover:text-ink")
      }
    >
      {label}
    </button>
  );
}

function CheckoutForm({
  open,
  onClose,
  slug,
  shippingFee,
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

  const ship = form.fulfillment === "shipping" ? shippingFee : 0;
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
            <option value="pickup">店頭で受け取る</option>
            <option value="shipping">
              配送（送料 {formatYen(shippingFee)}）
            </option>
          </Select>
        </div>
        {form.fulfillment === "shipping" && (
          <div>
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
          {ship > 0 && (
            <div className="flex justify-between text-muted">
              <span>送料</span>
              <span className="tabular-nums">{formatYen(ship)}</span>
            </div>
          )}
          <div className="flex justify-between font-semibold text-ink">
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
