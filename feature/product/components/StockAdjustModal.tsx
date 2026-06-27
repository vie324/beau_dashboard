"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select } from "@/components/ui/Input";
import { adjustStock } from "@/feature/product/actions/productActions";
import type { ProductRow } from "@/feature/product/services/getProducts";

export function StockAdjustModal({
  open,
  onClose,
  product,
}: {
  open: boolean;
  onClose: () => void;
  product: ProductRow;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<"in" | "waste" | "adjust">("in");
  const [amount, setAmount] = useState("1");
  const [safetyStock, setSafetyStock] = useState(String(product.safetyStock));
  const [reason, setReason] = useState("");

  function submit() {
    setError(null);
    const fd = new FormData();
    fd.set("productId", String(product.id));
    fd.set("type", type);
    fd.set("amount", amount.trim() || "0");
    fd.set("safetyStock", safetyStock.trim() || "0");
    if (reason.trim()) fd.set("reason", reason.trim());

    startTransition(async () => {
      const res = await adjustStock(null, fd);
      if (res.ok) {
        onClose();
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <Modal open={open} onClose={onClose} title={`在庫調整：${product.name}`}>
      <div className="space-y-4">
        <p className="text-sm text-muted">
          現在の在庫：
          <span className="font-semibold text-ink">{product.quantity}</span> 点
        </p>

        <div>
          <Label>操作</Label>
          <Select value={type} onChange={(e) => setType(e.target.value as typeof type)}>
            <option value="in">入荷（在庫を増やす）</option>
            <option value="waste">廃棄（在庫を減らす）</option>
            <option value="adjust">棚卸調整（実数に合わせる）</option>
          </Select>
        </div>

        <div>
          <Label>
            {type === "adjust" ? "調整後の実在庫数" : "数量"}
          </Label>
          <Input
            type="number"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            min={0}
          />
        </div>

        <div>
          <Label>発注点（在庫アラート）</Label>
          <Input
            type="number"
            inputMode="numeric"
            value={safetyStock}
            onChange={(e) => setSafetyStock(e.target.value)}
            min={0}
          />
        </div>

        <div>
          <Label>理由・メモ</Label>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="（任意）仕入れ先・棚卸日など"
            maxLength={200}
          />
        </div>

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
            {pending ? "更新中…" : "在庫を更新"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
