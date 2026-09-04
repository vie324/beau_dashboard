"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input, Label, Textarea, Select } from "@/components/ui/Input";
import {
  saveCoupon,
  setCouponActive,
  deleteCoupon,
} from "@/feature/coupon/actions/couponActions";
import type { CouponRow } from "@/feature/coupon/services/getCoupons";
import { describeCoupon, formatYen } from "@/helper/utils/retail";

const dateFmt = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Date(JST の日付境界で保存) → <input type="date"> 用 "YYYY-MM-DD"（JST）。 */
function toJstDateInput(d: Date | string | null | undefined): string {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(dt);
}

function couponState(c: CouponRow, now: number): { label: string; cls: string } {
  if (!c.isActive) return { label: "停止中", cls: "border-line bg-elevated text-muted" };
  if (c.expiresAt && new Date(c.expiresAt).getTime() < now)
    return { label: "期限切れ", cls: "border-line bg-elevated text-muted" };
  if (c.startsAt && new Date(c.startsAt).getTime() > now)
    return { label: "開始前", cls: "border-info/40 bg-info/10 text-info" };
  if (c.usageLimit != null && c.usedCount >= c.usageLimit)
    return { label: "上限到達", cls: "border-warn/40 bg-warn/10 text-warn" };
  return { label: "有効", cls: "border-ok/40 bg-ok/10 text-ok" };
}

type FormState = {
  code: string;
  name: string;
  type: "percent" | "fixed";
  value: string;
  minSubtotal: string;
  maxDiscount: string;
  startsAt: string;
  expiresAt: string;
  usageLimit: string;
  isActive: boolean;
  showOnStore: boolean;
  note: string;
};

const EMPTY: FormState = {
  code: "",
  name: "",
  type: "percent",
  value: "",
  minSubtotal: "0",
  maxDiscount: "0",
  startsAt: "",
  expiresAt: "",
  usageLimit: "",
  isActive: true,
  showOnStore: false,
  note: "",
};

export function CouponManagerModal({
  open,
  onClose,
  coupons,
}: {
  open: boolean;
  onClose: () => void;
  coupons: CouponRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: number | null; form: FormState } | null>(
    null,
  );
  const now = Date.now();

  function startCreate() {
    setError(null);
    setEditing({ id: null, form: EMPTY });
  }
  function startEdit(c: CouponRow) {
    setError(null);
    setEditing({
      id: c.id,
      form: {
        code: c.code,
        name: c.name,
        type: c.type === "fixed" ? "fixed" : "percent",
        value: String(c.value),
        minSubtotal: String(c.minSubtotal),
        maxDiscount: String(c.maxDiscount),
        startsAt: toJstDateInput(c.startsAt),
        expiresAt: toJstDateInput(c.expiresAt),
        usageLimit: c.usageLimit != null ? String(c.usageLimit) : "",
        isActive: c.isActive,
        showOnStore: c.showOnStore,
        note: c.note ?? "",
      },
    });
  }

  function submit() {
    if (!editing) return;
    const f = editing.form;
    setError(null);
    const fd = new FormData();
    if (editing.id) fd.set("id", String(editing.id));
    fd.set("code", f.code.trim());
    fd.set("name", f.name.trim());
    fd.set("type", f.type);
    fd.set("value", f.value.trim());
    fd.set("minSubtotal", f.minSubtotal.trim() || "0");
    fd.set("maxDiscount", f.maxDiscount.trim() || "0");
    if (f.startsAt) fd.set("startsAt", f.startsAt);
    if (f.expiresAt) fd.set("expiresAt", f.expiresAt);
    if (f.usageLimit.trim()) fd.set("usageLimit", f.usageLimit.trim());
    if (f.isActive) fd.set("isActive", "on");
    if (f.showOnStore) fd.set("showOnStore", "on");
    if (f.note.trim()) fd.set("note", f.note.trim());
    startTransition(async () => {
      const res = await saveCoupon(null, fd);
      if (res.ok) {
        setEditing(null);
        router.refresh();
      } else setError(res.error);
    });
  }

  function toggle(c: CouponRow) {
    startTransition(async () => {
      const res = await setCouponActive(c.id, !c.isActive);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  function remove(c: CouponRow) {
    if (!confirm(`クーポン「${c.name}」（${c.code}）を削除しますか？\n（過去の注文の値引き記録は残ります）`))
      return;
    startTransition(async () => {
      const res = await deleteCoupon(c.id);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  const setF = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setEditing((e) => (e ? { ...e, form: { ...e.form, [k]: v } } : e));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? (editing.id ? "クーポンの編集" : "新規クーポン") : "クーポン管理"}
      size="lg"
      footer={
        editing ? (
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditing(null)}
              disabled={pending}
            >
              一覧に戻る
            </Button>
            <Button size="sm" onClick={submit} disabled={pending}>
              {pending ? "保存中…" : "保存"}
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-faint">
              コードは公開ページのご購入手続きで入力してもらいます。
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={onClose}>
                閉じる
              </Button>
              <Button size="sm" onClick={startCreate}>
                ＋ 新規クーポン
              </Button>
            </div>
          </div>
        )
      }
    >
      {error && (
        <p className="mb-3 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
          {error}
        </p>
      )}

      {editing ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>クーポンコード（必須）</Label>
              <Input
                value={editing.form.code}
                onChange={(e) => setF("code", e.target.value.toUpperCase())}
                placeholder="WELCOME10"
                className="font-mono uppercase"
                maxLength={40}
              />
              <p className="mt-1 text-xs text-faint">半角英数字・ハイフン・_ 。大文字で保存。</p>
            </div>
            <div>
              <Label>クーポン名（必須）</Label>
              <Input
                value={editing.form.name}
                onChange={(e) => setF("name", e.target.value)}
                placeholder="はじめてのお買い物 10%OFF"
                maxLength={80}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>値引きの種類</Label>
              <Select
                value={editing.form.type}
                onChange={(e) => setF("type", e.target.value as "percent" | "fixed")}
              >
                <option value="percent">％割引</option>
                <option value="fixed">円引き</option>
              </Select>
            </div>
            <div>
              <Label>{editing.form.type === "percent" ? "割引率（%）" : "値引き額（円）"}</Label>
              <Input
                type="number"
                inputMode="numeric"
                value={editing.form.value}
                onChange={(e) => setF("value", e.target.value)}
                min={1}
                max={editing.form.type === "percent" ? 100 : undefined}
              />
            </div>
            {editing.form.type === "percent" && (
              <div>
                <Label>値引き上限（円）</Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={editing.form.maxDiscount}
                  onChange={(e) => setF("maxDiscount", e.target.value)}
                  min={0}
                />
                <p className="mt-1 text-xs text-faint">0で上限なし</p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>利用条件: 税込商品合計（円）以上</Label>
              <Input
                type="number"
                inputMode="numeric"
                value={editing.form.minSubtotal}
                onChange={(e) => setF("minSubtotal", e.target.value)}
                min={0}
              />
              <p className="mt-1 text-xs text-faint">0で無条件</p>
            </div>
            <div>
              <Label>利用回数の上限（全体）</Label>
              <Input
                type="number"
                inputMode="numeric"
                value={editing.form.usageLimit}
                onChange={(e) => setF("usageLimit", e.target.value)}
                placeholder="無制限"
                min={1}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>利用開始日</Label>
              <Input
                type="date"
                value={editing.form.startsAt}
                onChange={(e) => setF("startsAt", e.target.value)}
                className="date-input-tight"
              />
            </div>
            <div>
              <Label>有効期限（その日まで）</Label>
              <Input
                type="date"
                value={editing.form.expiresAt}
                onChange={(e) => setF("expiresAt", e.target.value)}
                className="date-input-tight"
              />
            </div>
          </div>

          <div>
            <Label>メモ（管理用）</Label>
            <Textarea
              value={editing.form.note}
              onChange={(e) => setF("note", e.target.value)}
              placeholder="配布方法・キャンペーン名 など"
              maxLength={300}
              className="min-h-[52px]"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={editing.form.showOnStore}
              onChange={(e) => setF("showOnStore", e.target.checked)}
              className="h-4 w-4 accent-accent"
            />
            販売ページにクーポンを掲示する（誰でも使える公開クーポン）
          </label>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={editing.form.isActive}
              onChange={(e) => setF("isActive", e.target.checked)}
              className="h-4 w-4 accent-accent"
            />
            有効にする
          </label>
        </div>
      ) : coupons.length === 0 ? (
        <div className="py-10 text-center">
          <p className="text-sm text-faint">クーポンはまだありません。</p>
          <p className="mt-1 text-xs text-faint">
            「初回10%OFF」「来院者限定500円引き」など、購入のきっかけになるクーポンを作れます。
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-line/70">
          {coupons.map((c) => {
            const st = couponState(c, now);
            return (
              <li key={c.id} className="py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-elevated px-2 py-0.5 font-mono text-sm font-semibold tracking-wider text-ink">
                    {c.code}
                  </span>
                  <span className="text-sm font-medium text-ink">{c.name}</span>
                  <Badge className={st.cls}>{st.label}</Badge>
                  {c.showOnStore && (
                    <Badge className="border-accent/40 bg-accent-soft text-accent-fg">
                      掲示中
                    </Badge>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
                  <span className="font-medium text-ink">{describeCoupon(c)}</span>
                  {c.minSubtotal > 0 && <span>{formatYen(c.minSubtotal)}以上</span>}
                  {(c.startsAt || c.expiresAt) && (
                    <span>
                      {c.startsAt ? dateFmt.format(new Date(c.startsAt)) : ""}〜
                      {c.expiresAt ? dateFmt.format(new Date(c.expiresAt)) : ""}
                    </span>
                  )}
                  <span className="tabular-nums">
                    利用 {c.usedCount}
                    {c.usageLimit != null ? ` / ${c.usageLimit}` : ""} 回
                  </span>
                  {c.note && <span className="text-faint">{c.note}</span>}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => startEdit(c)} disabled={pending}>
                    編集
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => toggle(c)} disabled={pending}>
                    {c.isActive ? "停止する" : "有効にする"}
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => remove(c)} disabled={pending}>
                    削除
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
