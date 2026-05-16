"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select, Textarea } from "@/components/ui/Input";
import { saveBookingLink } from "@/feature/booking-link/actions/bookingLinkActions";
import { bookingLinkSchema } from "@/feature/booking-link/schema/bookingLinkSchema";
import type { BookingLinkRow } from "@/feature/booking-link/services/getBookingLinks";

export function BookingLinkForm({
  open,
  onClose,
  shops,
  menus,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  shops: { id: number; name: string }[];
  menus: { id: number; name: string }[];
  initial?: BookingLinkRow | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    slug: initial?.slug ?? "",
    name: initial?.name ?? "",
    description: initial?.description ?? "",
    shopId: initial?.shopId ?? "",
    isActive: initial?.isActive ?? true,
    requireStaffSelection: initial?.requireStaffSelection ?? false,
    allowedMenuIds: initial?.allowedMenuIds ?? ([] as number[]),
    reminderEnabled: initial?.reminderEnabled ?? false,
    reminderHoursBefore: initial?.reminderHoursBefore ?? 24,
  });

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const toggleMenu = (id: number) =>
    setForm((f) => ({
      ...f,
      allowedMenuIds: f.allowedMenuIds.includes(id)
        ? f.allowedMenuIds.filter((x) => x !== id)
        : [...f.allowedMenuIds, id],
    }));

  function submit() {
    setError(null);
    const payload = {
      ...(initial ? { id: initial.id } : {}),
      slug: form.slug,
      name: form.name,
      description: form.description || undefined,
      shopId: form.shopId === "" ? undefined : Number(form.shopId),
      isActive: form.isActive,
      requireStaffSelection: form.requireStaffSelection,
      allowedMenuIds: form.allowedMenuIds,
      reminderEnabled: form.reminderEnabled,
      reminderHoursBefore: form.reminderHoursBefore,
    };

    const parsed = bookingLinkSchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "入力内容を確認してください");
      return;
    }

    const fd = new FormData();
    if (initial) fd.set("id", String(initial.id));
    fd.set("slug", parsed.data.slug);
    fd.set("name", form.name);
    fd.set("description", form.description);
    if (form.shopId !== "") fd.set("shopId", String(form.shopId));
    fd.set("isActive", String(form.isActive));
    fd.set("requireStaffSelection", String(form.requireStaffSelection));
    fd.set("allowedMenuIds", JSON.stringify(form.allowedMenuIds));
    fd.set("reminderEnabled", String(form.reminderEnabled));
    fd.set("reminderHoursBefore", String(form.reminderHoursBefore));

    startTransition(async () => {
      const res = await saveBookingLink(null, fd);
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
      title={initial ? "強制リンクの編集" : "新規 強制リンク"}
      className="max-w-xl"
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>リンク名</Label>
            <Input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="公式予約ページ"
            />
          </div>
          <div>
            <Label>slug（URL）</Label>
            <Input
              value={form.slug}
              onChange={(e) => set("slug", e.target.value)}
              placeholder="beau"
            />
          </div>
        </div>

        <p className="text-[11px] text-faint">
          公開URL: <span className="text-muted">/book/{form.slug || "…"}</span>
        </p>

        <div>
          <Label>説明</Label>
          <Textarea
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="予約ページに表示する案内文"
          />
        </div>

        <div>
          <Label>対象店舗</Label>
          <Select
            value={form.shopId}
            onChange={(e) => set("shopId", e.target.value)}
          >
            <option value="">ブランド共通（来店者が店舗を選択）</option>
            {shops.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} 限定
              </option>
            ))}
          </Select>
        </div>

        <div>
          <Label>予約可能メニュー</Label>
          <div className="max-h-40 space-y-1 overflow-y-auto rounded-xl border border-line bg-base p-3">
            {menus.length === 0 && (
              <p className="text-xs text-faint">メニューがありません</p>
            )}
            {menus.map((m) => (
              <label
                key={m.id}
                className="flex cursor-pointer items-center gap-2 text-sm text-ink"
              >
                <input
                  type="checkbox"
                  checked={form.allowedMenuIds.includes(m.id)}
                  onChange={() => toggleMenu(m.id)}
                  className="accent-accent"
                />
                {m.name}
              </label>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-faint">
            未選択の場合は公開メニューすべてが予約可能になります
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => set("isActive", e.target.checked)}
              className="accent-accent"
            />
            公開する
          </label>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={form.requireStaffSelection}
              onChange={(e) =>
                set("requireStaffSelection", e.target.checked)
              }
              className="accent-accent"
            />
            スタッフ指名を必須にする
          </label>
        </div>

        <div className="rounded-xl border border-line bg-base p-3">
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={form.reminderEnabled}
              onChange={(e) => set("reminderEnabled", e.target.checked)}
              className="accent-accent"
            />
            リマインド送信を有効にする
          </label>
          {form.reminderEnabled && (
            <div className="mt-3 flex items-center gap-2">
              <span className="text-xs text-muted">予約の</span>
              <Input
                type="number"
                min={1}
                max={168}
                value={form.reminderHoursBefore}
                onChange={(e) =>
                  set("reminderHoursBefore", Number(e.target.value))
                }
                className="h-8 w-20"
              />
              <span className="text-xs text-muted">時間前に送信</span>
            </div>
          )}
        </div>

        {error && (
          <p className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
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
