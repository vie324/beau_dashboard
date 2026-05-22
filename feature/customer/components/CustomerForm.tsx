"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input, Label, Textarea, Select } from "@/components/ui/Input";
import { saveCustomer } from "@/feature/customer/actions/customerActions";
import type { CustomerRow } from "@/feature/customer/services/getCustomers";

/** Date(UTC保存) → <input type="date"> 用の "YYYY-MM-DD"。 */
function toDateInput(d: Date | string | null | undefined): string {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toISOString().slice(0, 10);
}

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
    code: initial?.code ?? "",
    name: initial?.name ?? "",
    kana: initial?.kana ?? "",
    phone: initial?.phone ?? "",
    email: initial?.email ?? "",
    postalCode: initial?.postalCode ?? "",
    address: initial?.address ?? "",
    gender: initial?.gender ?? "",
    birthday: toDateInput(initial?.birthday),
    note: initial?.note ?? "",
  });

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  function submit() {
    setError(null);
    const fd = new FormData();
    if (initial?.id) fd.set("id", String(initial.id));
    fd.set("name", form.name.trim());
    if (form.code.trim()) fd.set("code", form.code.trim());
    if (form.kana.trim()) fd.set("kana", form.kana.trim());
    if (form.phone.trim()) fd.set("phone", form.phone.trim());
    if (form.email.trim()) fd.set("email", form.email.trim());
    if (form.postalCode.trim()) fd.set("postalCode", form.postalCode.trim());
    if (form.address.trim()) fd.set("address", form.address.trim());
    if (form.gender.trim()) fd.set("gender", form.gender.trim());
    if (form.birthday.trim()) fd.set("birthday", form.birthday.trim());
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

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>生年月日</Label>
            <Input
              type="date"
              value={form.birthday}
              onChange={(e) => set("birthday", e.target.value)}
            />
          </div>
          <div>
            <Label>性別</Label>
            <Select
              value={form.gender}
              onChange={(e) => set("gender", e.target.value)}
            >
              <option value="">未設定</option>
              <option value="男性">男性</option>
              <option value="女性">女性</option>
              <option value="その他">その他</option>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-[8rem_1fr] gap-3">
          <div>
            <Label>郵便番号</Label>
            <Input
              value={form.postalCode}
              onChange={(e) => set("postalCode", e.target.value)}
              placeholder="6540121"
              maxLength={16}
            />
          </div>
          <div>
            <Label>住所</Label>
            <Input
              value={form.address}
              onChange={(e) => set("address", e.target.value)}
              placeholder="神戸市…"
              maxLength={200}
            />
          </div>
        </div>

        <div>
          <Label>患者番号 / 会員番号</Label>
          <Input
            value={form.code}
            onChange={(e) => set("code", e.target.value)}
            placeholder="（任意・取込時の重複判定に使用）"
            maxLength={60}
          />
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
