"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select, Textarea } from "@/components/ui/Input";
import { STATUS_OPTIONS } from "@/helper/utils/status";
import { appointmentSchema } from "@/feature/reservation/schema/reservationSchema";
import {
  saveAppointment,
  deleteAppointment,
} from "@/feature/reservation/actions/reservationActions";
import type { ReservationRow } from "@/feature/reservation/services/getReservations";

type FormData = {
  staffs: { id: number; name: string; color?: string }[];
  menus: {
    id: number;
    name: string;
    durationMin: number;
    price: number;
    menuManageId: string;
  }[];
  customers: { id: number; name: string; phone: string | null }[];
  visitSources: { id: number; name: string }[];
};

export function AppointmentModal({
  open,
  onClose,
  date,
  formData,
  initial,
  prefill,
}: {
  open: boolean;
  onClose: () => void;
  date: string;
  formData: FormData;
  initial?: ReservationRow | null;
  prefill?: { staffId?: number; startTime?: string };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [salesTouched, setSalesTouched] = useState(false);

  const isEdit = Boolean(initial);

  const toTime = (d: Date) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Tokyo",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(d));

  const toDateStr = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(d));

  const initialDuration = initial
    ? Math.round(
        (new Date(initial.endAt).getTime() -
          new Date(initial.startAt).getTime()) /
          60000,
      )
    : 60;

  const [form, setForm] = useState({
    date: initial ? toDateStr(initial.startAt) : date,
    startTime: initial
      ? toTime(initial.startAt)
      : (prefill?.startTime ?? "10:00"),
    durationMin: initialDuration,
    menuId: initial?.menuId ?? formData.menus[0]?.id ?? "",
    staffId: initial?.staffId ?? prefill?.staffId ?? "",
    customerId: initial?.customerId ?? "",
    visitSourceId: initial?.visitSourceId ?? "",
    guestName: initial?.guestName ?? "",
    guestPhone: initial?.guestPhone ?? "",
    status: initial?.status ?? 0,
    sales: initial?.sales ?? "",
    note: initial?.note ?? "",
  });

  const set = <K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K],
  ) => setForm((f) => ({ ...f, [key]: value }));

  function submit() {
    setError(null);
    const payload = {
      ...(initial ? { id: initial.id } : {}),
      date: form.date,
      startTime: form.startTime,
      durationMin: form.durationMin,
      menuId: form.menuId || undefined,
      staffId: form.staffId || undefined,
      customerId: form.customerId || undefined,
      visitSourceId: form.visitSourceId || undefined,
      // A registered customer and a free-text guest are mutually exclusive.
      guestName: form.customerId ? undefined : form.guestName || undefined,
      guestPhone: form.customerId ? undefined : form.guestPhone || undefined,
      status: form.status,
      sales: form.sales === "" ? undefined : form.sales,
      note: form.note || undefined,
    };

    const parsed = appointmentSchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "入力内容を確認してください");
      return;
    }

    const fd = new FormData();
    Object.entries(payload).forEach(([k, v]) => {
      if (v !== undefined && v !== null) fd.set(k, String(v));
    });

    startTransition(async () => {
      const res = await saveAppointment(null, fd);
      if (res.ok) {
        onClose();
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  function remove() {
    if (!initial) return;
    if (!confirm("この予約を削除しますか？")) return;
    startTransition(async () => {
      const res = await deleteAppointment(initial.id);
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
      title={isEdit ? "予約の編集" : "新規予約"}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>日付</Label>
            <Input
              type="date"
              value={form.date}
              onChange={(e) => set("date", e.target.value)}
            />
          </div>
          <div>
            <Label>開始時刻</Label>
            <Input
              type="time"
              value={form.startTime}
              onChange={(e) => set("startTime", e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>メニュー</Label>
            <Select
              value={form.menuId}
              onChange={(e) => {
                const id = Number(e.target.value);
                const m = formData.menus.find((x) => x.id === id);
                setForm((f) => ({
                  ...f,
                  menuId: id,
                  durationMin: m?.durationMin ?? f.durationMin,
                  sales: !salesTouched && m ? m.price : f.sales,
                }));
              }}
            >
              <option value="">（未選択）</option>
              {formData.menus.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}（{m.durationMin}分 / ¥{m.price.toLocaleString()}）
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>施術時間（分）</Label>
            <Input
              type="number"
              min={5}
              step={5}
              value={form.durationMin}
              onChange={(e) => set("durationMin", Number(e.target.value))}
            />
          </div>
        </div>

        <div>
          <Label>担当スタッフ</Label>
          <Select
            value={form.staffId}
            onChange={(e) => set("staffId", e.target.value)}
          >
            <option value="">（指名なし）</option>
            {formData.staffs.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <Label>顧客</Label>
          <Select
            value={form.customerId}
            onChange={(e) => set("customerId", e.target.value)}
          >
            <option value="">（新規 / 来店者名を入力）</option>
            {formData.customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.phone ? `（${c.phone}）` : ""}
              </option>
            ))}
          </Select>
        </div>

        {!form.customerId && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>来店者名</Label>
              <Input
                value={form.guestName}
                onChange={(e) => set("guestName", e.target.value)}
                placeholder="山田 太郎"
              />
            </div>
            <div>
              <Label>電話番号</Label>
              <Input
                value={form.guestPhone}
                onChange={(e) => set("guestPhone", e.target.value)}
                placeholder="090-0000-0000"
              />
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>来店経路</Label>
            <Select
              value={form.visitSourceId}
              onChange={(e) => set("visitSourceId", e.target.value)}
            >
              <option value="">（未選択）</option>
              {formData.visitSources.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>売上（円）</Label>
            <Input
              type="number"
              min={0}
              value={form.sales}
              onChange={(e) => {
                setSalesTouched(true);
                set(
                  "sales",
                  e.target.value === "" ? "" : Number(e.target.value),
                );
              }}
              placeholder="0"
            />
          </div>
        </div>

        {isEdit && (
          <div>
            <Label>ステータス</Label>
            <Select
              value={form.status}
              onChange={(e) => set("status", Number(e.target.value))}
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>
        )}

        <div>
          <Label>メモ</Label>
          <Textarea
            value={form.note}
            onChange={(e) => set("note", e.target.value)}
            placeholder="施術内容や申し送り事項"
          />
        </div>

        {error && (
          <p className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
            {error}
          </p>
        )}

        <div className="flex items-center justify-between pt-2">
          {isEdit ? (
            <Button variant="danger" size="sm" onClick={remove} disabled={pending}>
              削除
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={pending}>
              キャンセル
            </Button>
            <Button size="sm" onClick={submit} disabled={pending}>
              {pending ? "保存中…" : "保存"}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
