"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input, Label, Textarea, Select } from "@/components/ui/Input";
import { saveProduct } from "@/feature/product/actions/productActions";
import type {
  ProductRow,
  CategoryRow,
} from "@/feature/product/services/getProducts";
import { parseImageUrls, taxInclusiveUnit, formatYen } from "@/helper/utils/retail";

export function ProductForm({
  open,
  onClose,
  initial,
  categories,
}: {
  open: boolean;
  onClose: () => void;
  initial?: ProductRow | null;
  categories: CategoryRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: initial?.name ?? "",
    sku: initial?.sku ?? "",
    categoryId: initial?.categoryId ? String(initial.categoryId) : "",
    price: initial ? String(initial.price) : "",
    cost: initial ? String(initial.cost) : "0",
    taxRate: initial ? String(initial.taxRate) : "10",
    description: initial?.description ?? "",
    imageUrlsText: parseImageUrls(initial?.imageUrls).join("\n"),
    isPublic: initial ? initial.isPublic : true,
    initialStock: "0",
    safetyStock: initial ? String(initial.safetyStock) : "0",
  });

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const priceNum = Number(form.price) || 0;
  const taxNum = Number(form.taxRate) || 0;

  function submit() {
    setError(null);
    const fd = new FormData();
    if (initial?.id) fd.set("id", String(initial.id));
    fd.set("name", form.name.trim());
    if (form.sku.trim()) fd.set("sku", form.sku.trim());
    if (form.categoryId) fd.set("categoryId", form.categoryId);
    fd.set("price", form.price.trim() || "0");
    fd.set("cost", form.cost.trim() || "0");
    fd.set("taxRate", form.taxRate.trim() || "10");
    if (form.description.trim()) fd.set("description", form.description.trim());
    if (form.imageUrlsText.trim())
      fd.set("imageUrlsText", form.imageUrlsText.trim());
    if (form.isPublic) fd.set("isPublic", "on");
    if (!initial) {
      fd.set("initialStock", form.initialStock.trim() || "0");
    }
    fd.set("safetyStock", form.safetyStock.trim() || "0");

    startTransition(async () => {
      const res = await saveProduct(null, fd);
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
      title={initial ? "商品の編集" : "新規商品の追加"}
    >
      <div className="space-y-4">
        <div>
          <Label>商品名（必須）</Label>
          <Input
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="腰用サポーター M"
            maxLength={120}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>カテゴリ</Label>
            <Select
              value={form.categoryId}
              onChange={(e) => set("categoryId", e.target.value)}
            >
              <option value="">未分類</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>商品コード(SKU)</Label>
            <Input
              value={form.sku}
              onChange={(e) => set("sku", e.target.value)}
              placeholder="（任意）"
              maxLength={60}
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label>販売価格(税抜)</Label>
            <Input
              type="number"
              inputMode="numeric"
              value={form.price}
              onChange={(e) => set("price", e.target.value)}
              placeholder="2000"
              min={0}
            />
          </div>
          <div>
            <Label>原価</Label>
            <Input
              type="number"
              inputMode="numeric"
              value={form.cost}
              onChange={(e) => set("cost", e.target.value)}
              min={0}
            />
          </div>
          <div>
            <Label>税率(%)</Label>
            <Select
              value={form.taxRate}
              onChange={(e) => set("taxRate", e.target.value)}
            >
              <option value="10">10%</option>
              <option value="8">8%（軽減）</option>
              <option value="0">0%（非課税）</option>
            </Select>
          </div>
        </div>
        <p className="text-xs text-faint">
          税込販売価格：{formatYen(taxInclusiveUnit(priceNum, taxNum))}
        </p>

        <div>
          <Label>商品説明</Label>
          <Textarea
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="素材・サイズ・効能など。公開ページに表示されます。"
            maxLength={2000}
          />
        </div>

        <div>
          <Label>画像URL（1行に1つ）</Label>
          <Textarea
            value={form.imageUrlsText}
            onChange={(e) => set("imageUrlsText", e.target.value)}
            placeholder={"https://example.com/item1.jpg\nhttps://example.com/item2.jpg"}
            maxLength={4000}
            className="min-h-[60px]"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          {!initial && (
            <div>
              <Label>初期在庫数</Label>
              <Input
                type="number"
                inputMode="numeric"
                value={form.initialStock}
                onChange={(e) => set("initialStock", e.target.value)}
                min={0}
              />
            </div>
          )}
          <div>
            <Label>発注点（在庫アラート）</Label>
            <Input
              type="number"
              inputMode="numeric"
              value={form.safetyStock}
              onChange={(e) => set("safetyStock", e.target.value)}
              min={0}
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={form.isPublic}
            onChange={(e) => set("isPublic", e.target.checked)}
            className="h-4 w-4 accent-accent"
          />
          公開ページに掲載する
        </label>

        {error && (
          <p className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
            {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={pending}>
            キャンセル
          </Button>
          <Button size="sm" onClick={submit} disabled={pending}>
            {pending ? "保存中…" : "保存"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
