"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select } from "@/components/ui/Input";
import { timeSlots } from "@/helper/utils/timeOptions";
import {
  saveTimeBlock,
  deleteTimeBlock,
} from "@/feature/reservation/actions/reservationActions";
import type { ReservationRow } from "@/feature/reservation/services/getReservations";

const TIME_SLOTS_15 = timeSlots(15);

export function TimeBlockModal({
  open,
  onClose,
  date,
  staffs,
  initial,
  prefill,
}: {
  open: boolean;
  onClose: () => void;
  date: string;
  staffs: { id: number; name: string }[];
  initial?: ReservationRow | null;
  prefill?: { staffId?: number; startTime?: string };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

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
      : (prefill?.startTime ?? "12:00"),
    durationMin: initialDuration,
    staffId: initial?.staffId ?? prefill?.staffId ?? "",
    label: initial?.blockLabel ?? "",
  });

  const set = <K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K],
  ) => setForm((f) => ({ ...f, [key]: value }));

  function submit() {
    setError(null);
    const fd = new FormData();
    if (initial?.id) fd.set("id", String(initial.id));
    fd.set("date", form.date);
    fd.set("startTime", form.startTime);
    fd.set("durationMin", String(form.durationMin));
    if (form.staffId) fd.set("staffId", String(form.staffId));
    if (form.label.trim()) fd.set("label", form.label.trim());

    startTransition(async () => {
      const res = await saveTimeBlock(null, fd);
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
    if (!confirm("この時間ブロックを削除しますか？")) return;
    startTransition(async () => {
      const res = await deleteTimeBlock(initial.id);
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
      title={isEdit ? "時間ブロックの編集" : "時間ブロックを追加"}
    >
      <div className="space-y-4">
        <p className="rounded-xl border border-line bg-base/50 px-3 py-2 text-xs text-muted">
          休憩・会議・私用などで予約を入れたくない時間を確保します。
          指定スタッフの予約枠を埋めるだけで、お客様への通知などは行いません。
        </p>

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
            <Label>開始時刻（15分単位）</Label>
            <Select
              value={form.startTime}
              onChange={(e) => set("startTime", e.target.value)}
            >
              {(TIME_SLOTS_15.includes(form.startTime)
                ? TIME_SLOTS_15
                : [form.startTime, ...TIME_SLOTS_15]
              ).map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>時間（分）</Label>
            <Input
              type="number"
              min={5}
              step={5}
              value={form.durationMin}
              onChange={(e) => set("durationMin", Number(e.target.value))}
            />
          </div>
          <div>
            <Label>対象スタッフ</Label>
            <Select
              value={form.staffId}
              onChange={(e) => set("staffId", e.target.value)}
              disabled={isEdit}
            >
              <option value="">全員</option>
              {staffs.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
            {isEdit && (
              <p className="mt-1 text-[11px] text-faint">
                対象スタッフの変更は一度削除して再作成してください。
              </p>
            )}
          </div>
        </div>

        <div>
          <Label>内容（任意）</Label>
          <Input
            value={form.label}
            onChange={(e) => set("label", e.target.value)}
            placeholder="休憩 / 会議 / 私用 など"
            maxLength={40}
          />
        </div>

        {error && (
          <p className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
            {error}
          </p>
        )}

        <div className="flex items-center justify-between pt-2">
          {isEdit ? (
            <Button
              variant="danger"
              size="sm"
              onClick={remove}
              disabled={pending}
            >
              削除
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              disabled={pending}
            >
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
