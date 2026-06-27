"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { saveLegalInfo } from "@/feature/product/actions/productActions";
import { parseLegalInfo } from "@/helper/utils/retail";

const FIELDS: {
  key: string;
  label: string;
  placeholder: string;
  textarea?: boolean;
}[] = [
  { key: "sellerName", label: "販売事業者名", placeholder: "株式会社○○ / Beau 銀座本店" },
  { key: "manager", label: "運営責任者", placeholder: "山田 太郎" },
  { key: "address", label: "所在地", placeholder: "〒000-0000 東京都中央区…" },
  { key: "phone", label: "電話番号", placeholder: "03-1234-5678" },
  { key: "email", label: "メールアドレス", placeholder: "shop@example.com" },
  { key: "hours", label: "受付時間", placeholder: "平日 10:00〜19:00" },
  {
    key: "extraFees",
    label: "商品代金以外の費用",
    placeholder: "送料、決済手数料 等",
    textarea: true,
  },
  {
    key: "paymentMethods",
    label: "お支払い方法",
    placeholder: "クレジットカード（Stripe）",
    textarea: true,
  },
  {
    key: "deliveryTime",
    label: "引渡し時期",
    placeholder: "ご注文後3〜5営業日以内に発送 / 店頭受取は翌営業日以降",
    textarea: true,
  },
  {
    key: "returnPolicy",
    label: "返品・交換について",
    placeholder: "商品到着後7日以内、未使用品に限り返品可。不良品は当店負担で交換。",
    textarea: true,
  },
];

export function LegalInfoModal({
  open,
  onClose,
  legalInfo,
}: {
  open: boolean;
  onClose: () => void;
  legalInfo: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const initial = parseLegalInfo(legalInfo);
  const [form, setForm] = useState<Record<string, string>>(() =>
    Object.fromEntries(FIELDS.map((f) => [f.key, initial[f.key] ?? ""])),
  );

  function submit() {
    setError(null);
    const fd = new FormData();
    for (const f of FIELDS) {
      const v = (form[f.key] ?? "").trim();
      if (v) fd.set(f.key, v);
    }
    startTransition(async () => {
      const res = await saveLegalInfo(null, fd);
      if (res.ok) {
        onClose();
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <Modal open={open} onClose={onClose} title="特定商取引法に基づく表記">
      <div className="space-y-4">
        <p className="rounded-xl border border-info/30 bg-info/10 px-3 py-2 text-xs text-info">
          オンラインで商品を販売する場合、特定商取引法に基づく表記の掲示が必要です。
          入力した内容は販売ページのフッターからお客様が確認できます。
        </p>
        {FIELDS.map((f) => (
          <div key={f.key}>
            <Label>{f.label}</Label>
            {f.textarea ? (
              <Textarea
                value={form[f.key]}
                onChange={(e) =>
                  setForm((s) => ({ ...s, [f.key]: e.target.value }))
                }
                placeholder={f.placeholder}
                className="min-h-[60px]"
              />
            ) : (
              <Input
                value={form[f.key]}
                onChange={(e) =>
                  setForm((s) => ({ ...s, [f.key]: e.target.value }))
                }
                placeholder={f.placeholder}
              />
            )}
          </div>
        ))}

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
