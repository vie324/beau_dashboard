"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { ProductForm } from "@/feature/product/components/ProductForm";
import { StockAdjustModal } from "@/feature/product/components/StockAdjustModal";
import { CategoryManagerModal } from "@/feature/product/components/CategoryManagerModal";
import { StorefrontSettingsModal } from "@/feature/product/components/StorefrontSettingsModal";
import { LegalInfoModal } from "@/feature/product/components/LegalInfoModal";
import { ReviewsModal } from "@/feature/product/components/ReviewsModal";
import { StarRating } from "@/feature/storefront/components/StarRating";
import { deleteProduct } from "@/feature/product/actions/productActions";
import type {
  ProductRow,
  CategoryRow,
  StockMovementRow,
} from "@/feature/product/services/getProducts";
import type { ShopRetail } from "@/feature/order/services/getShopRetail";
import {
  formatYen,
  taxInclusiveUnit,
  STOCK_MOVEMENT_LABELS,
} from "@/helper/utils/retail";

const dtFmt = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export function ProductsClient({
  products,
  categories,
  movements,
  shop,
  appUrl,
}: {
  products: ProductRow[];
  categories: CategoryRow[];
  movements: StockMovementRow[];
  shop: ShopRetail;
  appUrl: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"products" | "history">("products");
  const [editing, setEditing] = useState<ProductRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [stockFor, setStockFor] = useState<ProductRow | null>(null);
  const [reviewsFor, setReviewsFor] = useState<ProductRow | null>(null);
  const [showCats, setShowCats] = useState(false);
  const [showStore, setShowStore] = useState(false);
  const [showLegal, setShowLegal] = useState(false);
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.sku ?? "").toLowerCase().includes(q) ||
        (p.category?.name ?? "").toLowerCase().includes(q),
    );
  }, [products, query]);

  const lowStockCount = products.filter((p) => p.lowStock).length;
  const storeUrl = shop.storeSlug ? `${appUrl}/shop/${shop.storeSlug}` : null;

  function handleDelete(p: ProductRow) {
    if (!confirm(`「${p.name}」を削除しますか？（過去の注文履歴は残ります）`)) return;
    startTransition(async () => {
      const res = await deleteProduct(p.id);
      if (!res.ok) alert(res.error);
      else router.refresh();
    });
  }

  return (
    <>
      {/* 販売ページ設定カード */}
      <div className="mb-4 rounded-xl border border-line bg-surface p-4 shadow-panel">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-ink">
                お客様向け販売ページ
              </span>
              {shop.storeActive ? (
                <Badge className="border-ok/40 bg-ok/10 text-ok">公開中</Badge>
              ) : (
                <Badge className="border-line bg-elevated text-muted">非公開</Badge>
              )}
            </div>
            {storeUrl ? (
              <a
                href={`/shop/${shop.storeSlug}`}
                target="_blank"
                rel="noreferrer"
                className="mt-1 block truncate text-xs text-accent hover:underline"
              >
                {storeUrl}
              </a>
            ) : (
              <p className="mt-1 text-xs text-faint">
                URLスラッグ未設定。設定すると公開できます。
              </p>
            )}
            <p className="mt-1 text-xs text-muted">
              送料 {formatYen(shop.shippingFee)}
              {shop.freeShippingThreshold > 0 &&
                `（${formatYen(shop.freeShippingThreshold)}以上で無料）`}
              {" ／ "}ポイント付与 {shop.pointRatePercent}%
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowLegal(true)}
            >
              特商法の表記
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowStore(true)}>
              販売ページ設定
            </Button>
          </div>
        </div>
      </div>

      {/* ツールバー */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTab("products")}
            className={
              "rounded-xl px-3 py-1.5 text-sm font-medium transition-colors " +
              (tab === "products"
                ? "bg-accent text-accent-fg"
                : "text-muted hover:text-ink hover:bg-elevated")
            }
          >
            商品・在庫
          </button>
          <button
            onClick={() => setTab("history")}
            className={
              "rounded-xl px-3 py-1.5 text-sm font-medium transition-colors " +
              (tab === "history"
                ? "bg-accent text-accent-fg"
                : "text-muted hover:text-ink hover:bg-elevated")
            }
          >
            入出庫履歴
          </button>
          {lowStockCount > 0 && (
            <Badge className="border-warn/40 bg-warn/10 text-warn">
              在庫アラート {lowStockCount}
            </Badge>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowCats(true)}>
            カテゴリ管理
          </Button>
          <Button size="sm" onClick={() => setCreating(true)}>
            ＋ 新規商品
          </Button>
        </div>
      </div>

      {tab === "products" ? (
        <>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="商品名・SKU・カテゴリで検索"
            className="mb-3 sm:max-w-sm"
          />
          <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-panel">
            {filtered.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-faint">
                {query
                  ? "該当する商品がありません。"
                  : "商品が登録されていません。「＋ 新規商品」から追加してください。"}
              </p>
            ) : (
              <ul className="divide-y divide-line/70">
                {filtered.map((p) => (
                  <li
                    key={p.id}
                    className="flex flex-col gap-3 px-4 py-3 transition-colors hover:bg-elevated/30 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <button
                      type="button"
                      onClick={() => setEditing(p)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <span className="truncate font-medium text-ink">
                          {p.name}
                        </span>
                        {!p.isPublic && (
                          <Badge className="border-line bg-elevated text-muted">
                            非公開
                          </Badge>
                        )}
                        {p.lowStock && (
                          <Badge className="border-warn/40 bg-warn/10 text-warn">
                            在庫わずか
                          </Badge>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
                        {p.category && <span>{p.category.name}</span>}
                        {p.sku && <span className="text-faint">SKU:{p.sku}</span>}
                        <span className="tabular-nums">
                          {formatYen(taxInclusiveUnit(p.price, p.taxRate))}（税込）
                        </span>
                        <span className="tabular-nums">
                          原価 {formatYen(p.cost)}
                        </span>
                        {p.ratingCount > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <StarRating value={p.ratingAvg} size={12} />
                            <span className="text-faint">
                              {p.ratingAvg.toFixed(1)}（{p.ratingCount}）
                            </span>
                          </span>
                        )}
                      </div>
                    </button>
                    <div className="flex shrink-0 items-center gap-3 self-end sm:self-auto">
                      <div className="text-right">
                        <div
                          className={
                            "text-lg font-semibold tabular-nums " +
                            (p.lowStock ? "text-warn" : "text-ink")
                          }
                        >
                          {p.quantity}
                        </div>
                        <div className="text-[10px] text-faint">在庫数</div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setStockFor(p)}
                        disabled={pending}
                      >
                        在庫調整
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setReviewsFor(p)}
                        disabled={pending}
                      >
                        レビュー{p.ratingCount > 0 ? `(${p.ratingCount})` : ""}
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => handleDelete(p)}
                        disabled={pending}
                      >
                        削除
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-panel">
          {movements.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-faint">
              入出庫の記録がありません。
            </p>
          ) : (
            <ul className="divide-y divide-line/70">
              {movements.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center justify-between px-4 py-2.5 text-sm"
                >
                  <div className="min-w-0">
                    <span className="truncate font-medium text-ink">
                      {m.product.name}
                    </span>
                    {m.reason && (
                      <span className="ml-2 text-xs text-faint">{m.reason}</span>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <Badge className="border-line bg-elevated text-muted">
                      {STOCK_MOVEMENT_LABELS[m.type] ?? m.type}
                    </Badge>
                    <span
                      className={
                        "w-12 text-right font-semibold tabular-nums " +
                        (m.qty >= 0 ? "text-ok" : "text-danger")
                      }
                    >
                      {m.qty >= 0 ? `+${m.qty}` : m.qty}
                    </span>
                    <span className="w-24 text-right text-xs text-faint tabular-nums">
                      {dtFmt.format(m.createdAt)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {(creating || editing) && (
        <ProductForm
          open
          initial={editing}
          categories={categories}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
      {stockFor && (
        <StockAdjustModal
          open
          product={stockFor}
          onClose={() => setStockFor(null)}
        />
      )}
      {showCats && (
        <CategoryManagerModal
          open
          categories={categories}
          onClose={() => setShowCats(false)}
        />
      )}
      {showStore && (
        <StorefrontSettingsModal
          open
          shop={shop}
          onClose={() => setShowStore(false)}
        />
      )}
      {showLegal && (
        <LegalInfoModal
          open
          legalInfo={shop.legalInfo}
          onClose={() => setShowLegal(false)}
        />
      )}
      {reviewsFor && (
        <ReviewsModal
          open
          productId={reviewsFor.id}
          productName={reviewsFor.name}
          onClose={() => setReviewsFor(null)}
        />
      )}
    </>
  );
}
