"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { saveStorefrontSettings } from "@/feature/product/actions/productActions";
import type { ShopRetail } from "@/feature/order/services/getShopRetail";

export function StorefrontSettingsModal({
  open,
  onClose,
  shop,
}: {
  open: boolean;
  onClose: () => void;
  shop: ShopRetail;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    storeActive: shop.storeActive,
    storeSlug: shop.storeSlug ?? "",
    storeTitle: shop.storeTitle ?? "",
    storeDescription: shop.storeDescription ?? "",
    storeAnnouncement: shop.storeAnnouncement ?? "",
    storeHeroImageUrl: shop.storeHeroImageUrl ?? "",
    shippingFee: String(shop.shippingFee),
    freeShippingThreshold: String(shop.freeShippingThreshold),
    pointRatePercent: String(shop.pointRatePercent),
    allowPointRedeem: shop.allowPointRedeem,
  });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  function submit() {
    setError(null);
    const fd = new FormData();
    if (form.storeActive) fd.set("storeActive", "on");
    if (form.allowPointRedeem) fd.set("allowPointRedeem", "on");
    if (form.storeSlug.trim()) fd.set("storeSlug", form.storeSlug.trim());
    if (form.storeTitle.trim()) fd.set("storeTitle", form.storeTitle.trim());
    if (form.storeDescription.trim())
      fd.set("storeDescription", form.storeDescription.trim());
    if (form.storeAnnouncement.trim())
      fd.set("storeAnnouncement", form.storeAnnouncement.trim());
    if (form.storeHeroImageUrl.trim())
      fd.set("storeHeroImageUrl", form.storeHeroImageUrl.trim());
    fd.set("shippingFee", form.shippingFee.trim() || "0");
    fd.set("freeShippingThreshold", form.freeShippingThreshold.trim() || "0");
    fd.set("pointRatePercent", form.pointRatePercent.trim() || "0");

    startTransition(async () => {
      const res = await saveStorefrontSettings(null, fd);
      if (res.ok) {
        onClose();
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="販売ページ設定"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={pending}>
            キャンセル
          </Button>
          <Button size="sm" onClick={submit} disabled={pending}>
            {pending ? "保存中…" : "保存"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <Label>公開URLスラッグ</Label>
          <div className="flex items-center gap-1">
            <span className="text-xs text-faint">/shop/</span>
            <Input
              value={form.storeSlug}
              onChange={(e) => set("storeSlug", e.target.value)}
              placeholder="beau-ginza"
              maxLength={60}
            />
          </div>
          <p className="mt-1 text-xs text-faint">
            半角英小文字・数字・ハイフン。お客様向け販売ページのURLになります。
          </p>
        </div>

        <div>
          <Label>ページタイトル</Label>
          <Input
            value={form.storeTitle}
            onChange={(e) => set("storeTitle", e.target.value)}
            placeholder="Beau 銀座本店 物販ストア"
            maxLength={120}
          />
        </div>

        <div>
          <Label>紹介文</Label>
          <Textarea
            value={form.storeDescription}
            onChange={(e) => set("storeDescription", e.target.value)}
            placeholder="店頭でも人気のセルフケアグッズをオンラインでも。"
            maxLength={1000}
          />
        </div>

        <div>
          <Label>お知らせ（ページ上部に表示）</Label>
          <Textarea
            value={form.storeAnnouncement}
            onChange={(e) => set("storeAnnouncement", e.target.value)}
            placeholder="例）9月はサポーター全品セール中／年末年始の発送は1/6以降になります"
            maxLength={300}
            className="min-h-[60px]"
          />
          <p className="mt-1 text-xs text-faint">
            キャンペーンや発送のお知らせに。空欄なら表示されません。
          </p>
        </div>

        <div>
          <Label>ヒーロー画像URL</Label>
          <Input
            value={form.storeHeroImageUrl}
            onChange={(e) => set("storeHeroImageUrl", e.target.value)}
            placeholder="https://example.com/hero.jpg（任意）"
            maxLength={500}
          />
          <p className="mt-1 text-xs text-faint">
            ページ上部の背景に表示します。横長（例: 1600×600）の画像がきれいに収まります。
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>配送送料（円）</Label>
            <Input
              type="number"
              inputMode="numeric"
              value={form.shippingFee}
              onChange={(e) => set("shippingFee", e.target.value)}
              min={0}
            />
            <p className="mt-1 text-xs text-faint">0で送料無料</p>
          </div>
          <div>
            <Label>ポイント付与率（%）</Label>
            <Input
              type="number"
              inputMode="numeric"
              value={form.pointRatePercent}
              onChange={(e) => set("pointRatePercent", e.target.value)}
              min={0}
              max={100}
            />
            <p className="mt-1 text-xs text-faint">
              税抜小計の％を付与。0で無効（1pt=1円）
            </p>
          </div>
        </div>

        <div>
          <Label>送料無料になる購入金額（円）</Label>
          <Input
            type="number"
            inputMode="numeric"
            value={form.freeShippingThreshold}
            onChange={(e) => set("freeShippingThreshold", e.target.value)}
            min={0}
          />
          <p className="mt-1 text-xs text-faint">
            税込のお買い上げ合計がこの金額以上で送料無料。0で無効。
          </p>
        </div>

        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={form.allowPointRedeem}
            onChange={(e) => set("allowPointRedeem", e.target.checked)}
            className="h-4 w-4 accent-accent"
          />
          販売ページでのポイント利用（1pt=1円の値引き）を許可する
        </label>
        <p className="-mt-2 pl-6 text-xs text-faint">
          オフにしてもポイントは貯まります（利用は店頭のみ）。会員確認は会員番号（またはメール）＋電話番号で行います。
        </p>

        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={form.storeActive}
            onChange={(e) => set("storeActive", e.target.checked)}
            className="h-4 w-4 accent-accent"
          />
          販売ページを公開する
        </label>

        {error && (
          <p className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
