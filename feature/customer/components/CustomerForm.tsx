"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { saveCustomer } from "@/feature/customer/actions/customerActions";
import type { CustomerRow } from "@/feature/customer/services/getCustomers";

export function CustomerForm({
  open,
  onClose,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  initial?: CustomerRow | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: initial?.name ?? "",
    kana: initial?.kana ?? "",
    phone: initial?.phone ?? "",
    email: initial?.email ?? "",
    note: initial?.note ?? "",
  });

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  function submit() {
    setError(null);
    const fd = new FormData();
    if (initial?.id) fd.set("id", String(initial.id));
    fd.set("name", form.name.trim());
    if (form.kana.trim()) fd.set("kana", form.kana.trim());
    if (form.phone.trim()) fd.set("phone", form.phone.trim());
    if (form.email.trim()) fd.set("email", form.email.trim());
    if (form.note.trim()) fd.set("note", form.note.trim());

    startTransition(async () => {
      const res = await saveCustomer(null, fd);
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
      title={initial ? "顧客の編集" : "新規顧客の追加"}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>氏名（必須）</Label>
            <Input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="山田 太郎"
              maxLength={80}
            />
          </div>
          <div>
            <Label>フリガナ</Label>
            <Input
              value={form.kana}
              onChange={(e) => set("kana", e.target.value)}
              placeholder="ヤマダ タロウ"
              maxLength={80}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>電話番号</Label>
            <Input
              type="tel"
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
              placeholder="090-0000-0000"
              maxLength={40}
            />
          </div>
          <div>
            <Label>メール</Label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              placeholder="taro@example.com"
              maxLength={120}
            />
          </div>
        </div>

        <div>
          <Label>メモ</Label>
          <Textarea
            value={form.note}
            onChange={(e) => set("note", e.target.value)}
            placeholder="アレルギー・好み・施術履歴のメモ など"
            maxLength={1000}
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
            {pending ? "保存中…" : "保存"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
