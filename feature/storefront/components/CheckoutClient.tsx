"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Label, Textarea } from "@/components/ui/Input";
import type { StorefrontData } from "@/feature/storefront/services/getStorefront";
import {
  createCheckout,
  abandonCheckout,
} from "@/feature/storefront/actions/checkoutActions";
import { previewCoupon } from "@/feature/storefront/actions/couponActions";
import {
  getMemberSummary,
  type MemberProfile,
} from "@/feature/storefront/actions/memberActions";
import { MemberVerifyForm } from "@/feature/storefront/components/MemberVerifyForm";
import { PriceTag } from "@/feature/storefront/components/PriceTag";
import {
  CheckIcon,
  StoreIcon,
  TruckIcon,
  TicketIcon,
  CoinIcon,
  UserIcon,
} from "@/feature/storefront/components/icons";
import { readCart, writeCart, type CartEntry } from "@/feature/storefront/lib/cart";
import {
  readBuyerInfo,
  writeBuyerInfo,
  clearBuyerInfo,
} from "@/feature/storefront/lib/buyerInfo";
import {
  readMemberSession,
  clearMemberSession,
  writeMemberSession,
} from "@/feature/storefront/lib/memberSession";
import {
  computeTotals,
  clampPointsUsage,
  formatYen,
  taxInclusiveUnit,
  parseImageUrls,
  normalizeCouponCode,
  type CartLine,
} from "@/helper/utils/retail";

const MAX_QTY = 99;

type Member = {
  token: string;
  name: string;
  pointsBalance: number;
  profile: MemberProfile | null;
};

type AppliedCoupon = {
  code: string;
  name: string;
  description: string;
  discount: number;
};

export function CheckoutClient({
  data,
  canceledOrderNo,
}: {
  data: StorefrontData;
  canceledOrderNo?: string | null;
}) {
  const { shop, products } = data;
  const slug = shop.storeSlug as string;
  const productById = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products],
  );

  const [cart, setCart] = useState<CartEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [member, setMember] = useState<Member | null>(null);
  const [memberNotice, setMemberNotice] = useState<string | null>(null);
  const [showVerify, setShowVerify] = useState(false);
  const [pointsInput, setPointsInput] = useState("");
  const [form, setForm] = useState({
    buyerName: "",
    buyerPhone: "",
    buyerEmail: "",
    buyerCode: "",
    fulfillment: "pickup" as "pickup" | "shipping",
    shippingAddress: "",
    note: "",
  });
  const [remember, setRemember] = useState(true);
  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState<AppliedCoupon | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponPending, setCouponPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const abandoned = useRef(false);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  /** 会員プロフィールで未入力の項目だけを埋める（手入力を上書きしない）。 */
  function prefillFromProfile(p: MemberProfile) {
    setForm((f) => ({
      ...f,
      buyerName: f.buyerName || p.name,
      buyerPhone: f.buyerPhone || (p.phone ?? ""),
      buyerEmail: f.buyerEmail || (p.email ?? ""),
      buyerCode: p.code ?? f.buyerCode,
      shippingAddress:
        f.shippingAddress ||
        [p.postalCode ? `〒${p.postalCode}` : "", p.address ?? ""]
          .filter(Boolean)
          .join(" "),
    }));
  }

  // 初期化: カート正規化・購入者情報の復元・会員セッションの検証
  useEffect(() => {
    const raw = readCart(slug);
    const reconciled = raw
      .map((e) => {
        const p = productById.get(e.productId);
        if (!p || p.stock <= 0) return null;
        return { productId: e.productId, qty: Math.min(e.qty, p.stock, MAX_QTY) };
      })
      .filter((x): x is CartEntry => x !== null && x.qty > 0);
    setCart(reconciled);
    if (JSON.stringify(reconciled) !== JSON.stringify(raw)) writeCart(slug, reconciled);

    const saved = readBuyerInfo(slug);
    if (saved) {
      setForm((f) => ({
        ...f,
        buyerName: saved.buyerName,
        buyerPhone: saved.buyerPhone,
        buyerEmail: saved.buyerEmail,
        buyerCode: saved.buyerCode,
        fulfillment: saved.fulfillment,
        shippingAddress: saved.shippingAddress,
      }));
    }
    setLoaded(true);

    const session = readMemberSession(slug);
    if (session) {
      setMember({
        token: session.token,
        name: session.name,
        pointsBalance: session.pointsBalance,
        profile: null,
      });
      void (async () => {
        const res = await getMemberSummary({ slug, token: session.token });
        if (!res.ok) {
          clearMemberSession(slug);
          setMember(null);
          setMemberNotice(res.error);
          return;
        }
        setMember({
          token: session.token,
          name: res.member.name,
          pointsBalance: res.member.pointsBalance,
          profile: res.member,
        });
        writeMemberSession(slug, {
          token: session.token,
          name: res.member.name,
          pointsBalance: res.member.pointsBalance,
        });
        prefillFromProfile(res.member);
      })();
    }
  }, [slug, productById]);

  // Stripe から戻ってきた（決済を中断した）場合は、押さえていた在庫等を解放する
  useEffect(() => {
    if (!canceledOrderNo || abandoned.current) return;
    abandoned.current = true;
    void abandonCheckout({ slug, orderNo: canceledOrderNo });
  }, [slug, canceledOrderNo]);

  function persistCart(next: CartEntry[]) {
    setCart(next);
    writeCart(slug, next);
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

  const lines: CartLine[] = cart
    .map((e) => {
      const p = productById.get(e.productId);
      return p
        ? { productId: p.id, name: p.name, price: p.price, taxRate: p.taxRate, qty: e.qty }
        : null;
    })
    .filter((x): x is CartLine => x !== null);

  const baseShipping = form.fulfillment === "shipping" ? shop.shippingFee : 0;
  const couponDiscount = coupon?.discount ?? 0;
  const pre = computeTotals(
    lines,
    baseShipping,
    shop.pointRatePercent,
    shop.freeShippingThreshold,
    { couponDiscount },
  );
  const canRedeem = Boolean(member) && shop.allowPointRedeem;
  const balance = member?.pointsBalance ?? 0;
  const maxPoints = canRedeem ? clampPointsUsage(balance, balance, pre.payable) : 0;
  const pointsRequested = Math.max(0, Math.floor(Number(pointsInput) || 0));
  const pointsUsed = canRedeem
    ? clampPointsUsage(pointsRequested, balance, pre.payable)
    : 0;
  const totals = computeTotals(
    lines,
    baseShipping,
    shop.pointRatePercent,
    shop.freeShippingThreshold,
    { couponDiscount, pointsUsed },
  );

  // カート内容が変わったら適用中のクーポンを再判定（最低金額を割った等）
  const cartKey = cart.map((e) => `${e.productId}:${e.qty}`).join(",");
  useEffect(() => {
    if (!coupon) return;
    if (cart.length === 0) {
      setCoupon(null);
      return;
    }
    let cancelled = false;
    void previewCoupon({ slug, code: coupon.code, items: cart }).then((res) => {
      if (cancelled) return;
      if (res.ok) {
        setCoupon({ code: res.code, name: res.name, description: res.description, discount: res.discount });
      } else {
        setCoupon(null);
        setCouponError(res.error);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartKey]);

  async function applyCoupon() {
    const code = normalizeCouponCode(couponInput);
    if (!code) {
      setCouponError("クーポンコードを入力してください");
      return;
    }
    setCouponError(null);
    setCouponPending(true);
    const res = await previewCoupon({ slug, code, items: cart });
    setCouponPending(false);
    if (!res.ok) {
      setCoupon(null);
      setCouponError(res.error);
      return;
    }
    setCoupon({ code: res.code, name: res.name, description: res.description, discount: res.discount });
    setCouponInput("");
  }

  function submit() {
    setError(null);
    if (cart.length === 0) {
      setError("カートが空です");
      return;
    }
    if (!form.buyerName.trim()) {
      setError("お名前を入力してください");
      return;
    }
    if (form.fulfillment === "shipping" && !form.shippingAddress.trim()) {
      setError("配送先住所を入力してください");
      return;
    }
    startTransition(async () => {
      const res = await createCheckout({
        slug,
        items: cart,
        buyerName: form.buyerName.trim(),
        buyerPhone: form.buyerPhone.trim() || null,
        buyerEmail: form.buyerEmail.trim() || null,
        buyerCode: form.buyerCode.trim() || null,
        fulfillment: form.fulfillment,
        shippingAddress: form.shippingAddress.trim() || null,
        note: form.note.trim() || null,
        memberToken: member?.token ?? null,
        pointsToUse: pointsUsed,
        couponCode: coupon?.code ?? null,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (remember) {
        writeBuyerInfo(slug, {
          buyerName: form.buyerName.trim(),
          buyerPhone: form.buyerPhone.trim(),
          buyerEmail: form.buyerEmail.trim(),
          buyerCode: form.buyerCode.trim(),
          fulfillment: form.fulfillment,
          shippingAddress: form.shippingAddress.trim(),
        });
      } else {
        clearBuyerInfo(slug);
      }
      // カートは注文完了ページで空にする（決済を中断して戻ってきても内容が残るように）
      window.location.href = res.url;
    });
  }

  if (!loaded) {
    return <div className="h-64 animate-pulse rounded-2xl bg-elevated" />;
  }

  if (cart.length === 0) {
    return (
      <div className="rounded-3xl border border-line bg-surface px-6 py-14 text-center shadow-panel">
        <p className="text-sm text-muted">カートに商品がありません。</p>
        <a
          href={`/shop/${slug}`}
          className="mt-4 inline-flex h-10 items-center rounded-xl bg-accent px-5 text-sm font-semibold text-accent-fg hover:bg-accent-hover"
        >
          商品を見る
        </a>
      </div>
    );
  }

  const payLabel =
    totals.total === 0
      ? "注文を確定する（お支払い 0円）"
      : pending
        ? "決済ページへ移動中…"
        : `決済へ進む（${formatYen(totals.total)}）`;

  return (
    <div className="lg:grid lg:grid-cols-[1fr_360px] lg:items-start lg:gap-8">
      <div className="space-y-5">
        {canceledOrderNo && (
          <p className="rounded-xl border border-warn/30 bg-warn/10 px-4 py-2 text-sm text-warn">
            決済を中断しました。内容はそのまま残っていますので、あらためてお手続きください。
          </p>
        )}

        {/* 1. ご注文内容 */}
        <Step n={1} title="ご注文内容">
          <ul className="divide-y divide-line/70">
            {cart.map((e) => {
              const p = productById.get(e.productId);
              if (!p) return null;
              const img = parseImageUrls(p.imageUrls)[0];
              return (
                <li key={e.productId} className="flex gap-3 py-3">
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-elevated">
                    {img ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={img} alt={p.name} className="h-full w-full object-cover" />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-ink">{p.name}</div>
                    <PriceTag
                      size="sm"
                      price={p.price}
                      compareAtPrice={p.compareAtPrice}
                      taxRate={p.taxRate}
                    />
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <QtyButton label="−" onClick={() => setQty(e.productId, e.qty - 1)} />
                      <span className="w-7 text-center text-sm tabular-nums">{e.qty}</span>
                      <QtyButton
                        label="＋"
                        disabled={e.qty >= Math.min(p.stock, MAX_QTY)}
                        onClick={() => setQty(e.productId, e.qty + 1)}
                      />
                      <button
                        onClick={() => setQty(e.productId, 0)}
                        className="ml-2 text-xs text-faint hover:text-danger"
                      >
                        削除
                      </button>
                      <span className="ml-auto text-sm font-semibold tabular-nums text-ink">
                        {formatYen(taxInclusiveUnit(p.price, p.taxRate) * e.qty)}
                      </span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </Step>

        {/* 2. 会員確認・ポイント */}
        <Step
          n={2}
          title="会員確認・ポイント"
          badge={member ? "確認済み" : "任意"}
          badgeTone={member ? "ok" : "muted"}
        >
          {memberNotice && !member && (
            <p className="mb-3 rounded-xl border border-info/30 bg-info/10 px-3 py-2 text-xs text-info">
              {memberNotice}
            </p>
          )}
          {member ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3 rounded-xl border border-ok/30 bg-ok/5 px-3 py-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ok/15 text-ok">
                  <CheckIcon size={18} />
                </span>
                <div className="min-w-0 flex-1 text-sm">
                  <span className="font-medium text-ink">{member.name} 様</span>
                  <span className="ml-2 text-xs text-muted">
                    残高{" "}
                    <span className="font-semibold tabular-nums text-accent">
                      {member.pointsBalance.toLocaleString("ja-JP")}pt
                    </span>
                  </span>
                </div>
                <button
                  onClick={() => {
                    clearMemberSession(slug);
                    setMember(null);
                    setPointsInput("");
                  }}
                  className="text-xs text-faint hover:text-danger"
                >
                  解除
                </button>
              </div>

              {shop.allowPointRedeem ? (
                member.pointsBalance > 0 ? (
                  <div className="rounded-xl border border-accent/30 bg-accent-soft/50 p-3">
                    <div className="flex items-center gap-1.5 text-sm font-medium text-ink">
                      <CoinIcon size={16} className="text-accent" />
                      ポイントを使う
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <div className="relative">
                        <Input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={maxPoints}
                          value={pointsInput}
                          onChange={(e) => setPointsInput(e.target.value)}
                          placeholder="0"
                          className="w-36 pr-8 text-right"
                          aria-label="利用ポイント"
                        />
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-faint">
                          pt
                        </span>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setPointsInput(String(maxPoints))}
                        disabled={maxPoints === 0}
                      >
                        すべて使う（{maxPoints.toLocaleString("ja-JP")}pt）
                      </Button>
                      {pointsUsed > 0 && (
                        <Button size="sm" variant="ghost" onClick={() => setPointsInput("")}>
                          使わない
                        </Button>
                      )}
                    </div>
                    {pointsRequested > pointsUsed && (
                      <p className="mt-2 text-xs text-warn">
                        利用ポイントを {pointsUsed.toLocaleString("ja-JP")}pt に調整しました
                        （残高・お支払い額・最低決済額 50円 の範囲内で利用できます）
                      </p>
                    )}
                    <p className="mt-2 text-[11px] leading-relaxed text-muted">
                      1pt = 1円。ポイントでお支払いした分にはポイントは付与されません。
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-muted">
                    ご利用可能なポイントはありません。今回のお買い物で
                    {shop.pointRatePercent > 0 && ` ${totals.pointsEarned.toLocaleString("ja-JP")}pt が`}
                    貯まります。
                  </p>
                )
              ) : (
                <p className="text-xs text-muted">
                  ポイントは貯まります（オンラインでのご利用は受け付けていません。店頭でご利用ください）。
                </p>
              )}
            </div>
          ) : showVerify ? (
            <MemberVerifyForm
              slug={slug}
              compact
              onVerified={({ token, member: m }) => {
                setMember({ token, name: m.name, pointsBalance: m.pointsBalance, profile: m });
                setMemberNotice(null);
                setShowVerify(false);
                prefillFromProfile(m);
              }}
            />
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-2 text-sm text-muted">
                <UserIcon size={18} className="mt-0.5 shrink-0 text-accent" />
                <p className="leading-relaxed">
                  会員（ご来院者）の方は会員確認をすると
                  {shop.allowPointRedeem ? "ポイントが使えて、" : ""}
                  お客様情報が自動入力されます。
                  {shop.pointRatePercent > 0 && (
                    <span className="block text-xs text-faint">
                      初めての方も、ご購入で{shop.pointRatePercent}%のポイントが貯まります。
                    </span>
                  )}
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => setShowVerify(true)}>
                会員確認する
              </Button>
            </div>
          )}
        </Step>

        {/* 3. お客様情報 */}
        <Step n={3} title="お客様情報">
          <div className="space-y-3">
            <div>
              <Label>お名前（必須）</Label>
              <Input
                value={form.buyerName}
                onChange={(e) => set("buyerName", e.target.value)}
                placeholder="山田 太郎"
                autoComplete="name"
                maxLength={80}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>電話番号</Label>
                <Input
                  type="tel"
                  value={form.buyerPhone}
                  onChange={(e) => set("buyerPhone", e.target.value)}
                  placeholder="090-0000-0000"
                  autoComplete="tel"
                  maxLength={40}
                />
              </div>
              <div>
                <Label>メールアドレス</Label>
                <Input
                  type="email"
                  value={form.buyerEmail}
                  onChange={(e) => set("buyerEmail", e.target.value)}
                  placeholder="taro@example.com"
                  autoComplete="email"
                  maxLength={120}
                />
                <p className="mt-1 text-[11px] text-faint">
                  決済の領収メールの送付先になります。
                </p>
              </div>
            </div>
            {!member && (
              <div>
                <Label>会員番号（お持ちの方）</Label>
                <Input
                  value={form.buyerCode}
                  onChange={(e) => set("buyerCode", e.target.value)}
                  placeholder="診察券・会員番号を入力するとポイントが貯まります"
                  maxLength={60}
                />
              </div>
            )}
            <label className="flex items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="h-3.5 w-3.5 accent-accent"
              />
              次回のためにこの端末に入力内容を保存する
            </label>
          </div>
        </Step>

        {/* 4. 受け取り方法 */}
        <Step n={4} title="お受け取り方法">
          <div className="grid gap-2 sm:grid-cols-2">
            <ChoiceCard
              active={form.fulfillment === "pickup"}
              onClick={() => set("fulfillment", "pickup")}
              icon={<StoreIcon size={18} />}
              title="店頭で受け取る"
              desc="送料無料。次回ご来院時に受付でお渡しします。"
            />
            <ChoiceCard
              active={form.fulfillment === "shipping"}
              onClick={() => set("fulfillment", "shipping")}
              icon={<TruckIcon size={18} />}
              title="配送で受け取る"
              desc={
                shop.shippingFee === 0
                  ? "全国送料無料"
                  : shop.freeShippingThreshold > 0 && pre.itemsTotal >= shop.freeShippingThreshold
                    ? "送料無料（条件達成）"
                    : `送料 ${formatYen(shop.shippingFee)}` +
                      (shop.freeShippingThreshold > 0
                        ? `／${formatYen(shop.freeShippingThreshold)}以上で無料`
                        : "")
              }
            />
          </div>
          {form.fulfillment === "shipping" && (
            <div className="mt-3 animate-slide-up">
              <Label>配送先住所（必須）</Label>
              <Textarea
                value={form.shippingAddress}
                onChange={(e) => set("shippingAddress", e.target.value)}
                placeholder="〒000-0000 東京都…（建物名・部屋番号まで）"
                autoComplete="street-address"
                maxLength={300}
              />
            </div>
          )}
        </Step>

        {/* 5. クーポン */}
        <Step n={5} title="クーポン" badge="任意" badgeTone="muted">
          {coupon ? (
            <div className="flex items-center gap-3 rounded-xl border border-ok/30 bg-ok/5 px-3 py-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ok/15 text-ok">
                <TicketIcon size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-ink">{coupon.name}</div>
                <div className="text-xs text-muted">
                  <span className="font-mono">{coupon.code}</span>・{coupon.description}
                </div>
              </div>
              <span className="text-sm font-semibold tabular-nums text-ok">
                −{formatYen(coupon.discount)}
              </span>
              <button
                onClick={() => {
                  setCoupon(null);
                  setCouponError(null);
                }}
                className="text-xs text-faint hover:text-danger"
              >
                解除
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Input
                value={couponInput}
                onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void applyCoupon();
                  }
                }}
                placeholder="クーポンコード"
                className="font-mono uppercase"
                maxLength={40}
                aria-label="クーポンコード"
              />
              <Button
                variant="outline"
                onClick={() => void applyCoupon()}
                disabled={couponPending || !couponInput.trim()}
                className="shrink-0"
              >
                {couponPending ? "確認中…" : "適用"}
              </Button>
            </div>
          )}
          {couponError && (
            <p className="mt-2 text-xs text-danger">{couponError}</p>
          )}
        </Step>

        {/* 6. 備考 */}
        <Step n={6} title="備考" badge="任意" badgeTone="muted">
          <Textarea
            value={form.note}
            onChange={(e) => set("note", e.target.value)}
            placeholder="ご要望があればご記入ください（サイズ・受取希望日 など）"
            maxLength={500}
            className="min-h-[60px]"
          />
        </Step>
      </div>

      {/* 注文サマリ */}
      <aside className="mt-6 lg:sticky lg:top-24 lg:mt-0">
        <div className="rounded-2xl border border-line bg-surface p-5 shadow-panel">
          <h2 className="text-sm font-semibold text-ink">お支払い金額</h2>
          <dl className="mt-3 space-y-1.5 text-sm">
            <Row label="商品合計（税込）" value={formatYen(totals.itemsTotal)} />
            {totals.couponDiscount > 0 && (
              <Row label="クーポン値引き" value={`−${formatYen(totals.couponDiscount)}`} tone="ok" />
            )}
            <Row
              label="送料"
              value={
                form.fulfillment === "pickup"
                  ? "無料（店頭受取）"
                  : totals.shippingFee > 0
                    ? formatYen(totals.shippingFee)
                    : "無料"
              }
            />
            {totals.pointsUsed > 0 && (
              <Row label="ポイント利用" value={`−${formatYen(totals.pointsUsed)}`} tone="ok" />
            )}
          </dl>
          <div className="mt-3 flex items-baseline justify-between border-t border-line pt-3">
            <span className="text-sm font-semibold text-ink">お支払い合計</span>
            <span className="text-2xl font-bold tabular-nums text-ink">
              {formatYen(totals.total)}
            </span>
          </div>
          {shop.pointRatePercent > 0 && (
            <p className="mt-1 text-right text-xs text-accent">
              このご注文で +{totals.pointsEarned.toLocaleString("ja-JP")}pt
              {member ? "" : "（会員番号の入力またはご登録で付与）"}
            </p>
          )}

          {error && (
            <p className="mt-3 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
              {error}
            </p>
          )}

          <Button className="mt-4 h-12 w-full text-sm" onClick={submit} disabled={pending}>
            {payLabel}
          </Button>
          <p className="mt-2 text-center text-[11px] leading-relaxed text-faint">
            {totals.total === 0
              ? "お支払いはありません。ボタンを押すと注文が確定します。"
              : "「決済へ進む」を押すと、安全な Stripe の決済ページへ移動します。カード情報は当店には保存されません。"}
          </p>
          <a
            href={`/shop/${slug}`}
            className="mt-3 block text-center text-xs text-muted hover:text-ink"
          >
            買い物を続ける
          </a>
        </div>
      </aside>

      {/* スマホ用の固定バー */}
      <div
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur lg:hidden"
        style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <div className="min-w-0">
            <div className="text-[11px] text-muted">お支払い合計</div>
            <div className="text-lg font-bold tabular-nums text-ink">
              {formatYen(totals.total)}
            </div>
          </div>
          <Button className="h-11 flex-1" onClick={submit} disabled={pending}>
            {payLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Step({
  n,
  title,
  badge,
  badgeTone,
  children,
}: {
  n: number;
  title: string;
  badge?: string;
  badgeTone?: "ok" | "muted";
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-4 shadow-panel sm:p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink text-[11px] font-bold text-surface">
          {n}
        </span>
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {badge && (
          <span
            className={
              "rounded-md border px-1.5 py-0.5 text-[10px] font-medium " +
              (badgeTone === "ok"
                ? "border-ok/40 bg-ok/10 text-ok"
                : "border-line bg-elevated text-muted")
            }
          >
            {badge}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok";
}) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted">{label}</dt>
      <dd className={"tabular-nums " + (tone === "ok" ? "text-ok" : "text-ink")}>
        {value}
      </dd>
    </div>
  );
}

function ChoiceCard({
  active,
  onClick,
  icon,
  title,
  desc,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        "flex items-start gap-3 rounded-xl border p-3 text-left transition-colors " +
        (active
          ? "border-accent bg-accent-soft/60"
          : "border-line bg-base/40 hover:border-accent/40")
      }
    >
      <span
        className={
          "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full " +
          (active ? "bg-accent text-accent-fg" : "bg-elevated text-muted")
        }
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink">{title}</span>
        <span className="block text-xs text-muted">{desc}</span>
      </span>
    </button>
  );
}

function QtyButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex h-7 w-7 items-center justify-center rounded-lg border border-line text-muted transition-colors hover:bg-elevated disabled:opacity-40"
    >
      {label}
    </button>
  );
}
