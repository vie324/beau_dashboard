"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select } from "@/components/ui/Input";
import { timeSlots } from "@/helper/utils/timeOptions";
import { addMinutes, jstDateTimeToDate } from "@/helper/utils/time";
import {
  saveTimeBlock,
  deleteTimeBlock,
} from "@/feature/reservation/actions/reservationActions";
import type { ReservationRow } from "@/feature/reservation/services/getReservations";
import type { ReservationOptimisticDispatch } from "@/feature/reservation/types/optimistic";

const TIME_SLOTS_15 = timeSlots(15);

export function TimeBlockModal({
  open,
  onClose,
  date,
  staffs,
  initial,
  prefill,
  onOptimistic,
}: {
  open: boolean;
  onClose: () => void;
  date: string;
  staffs: { id: number; name: string }[];
  initial?: ReservationRow | null;
  prefill?: { staffId?: number; startTime?: string; durationMin?: number };
  onOptimistic?: ReservationOptimisticDispatch;
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
    durationMin: initial ? initialDuration : (prefill?.durationMin ?? 60),
    staffId: initial?.staffId ?? prefill?.staffId ?? "",
    label: initial?.blockLabel ?? "",
  });

  const set = <K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K],
  ) => setForm((f) => ({ ...f, [key]: value }));

  function buildBlockRow(staffId: number, idOverride: number): ReservationRow {
    const startAt = jstDateTimeToDate(form.date, form.startTime);
    const endAt = addMinutes(startAt, form.durationMin);
    const staff = staffs.find((s) => s.id === staffId) ?? null;
    return {
      id: idOverride,
      shopId: initial?.shopId ?? 0,
      customerId: null,
      staffId,
      menuId: null,
      visitSourceId: null,
      bookingLinkId: null,
      startAt,
      endAt,
      status: 0,
      sales: null,
      note: null,
      isMemberJoin: false,
      source: "manual",
      confirmed: true,
      kind: "block",
      blockLabel: form.label.trim() || null,
      guestName: null,
      guestPhone: null,
      createdAt: initial?.createdAt ?? new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      customer: null,
      staff: staff ? { id: staff.id, name: staff.name, color: null } : null,
      menu: null,
      visitSource: null,
    } as unknown as ReservationRow;
  }

  function submit() {
    setError(null);
    const fd = new FormData();
    if (initial?.id) fd.set("id", String(initial.id));
    fd.set("date", form.date);
    fd.set("startTime", form.startTime);
    fd.set("durationMin", String(form.durationMin));
    if (form.staffId) fd.set("staffId", String(form.staffId));
    if (form.label.trim()) fd.set("label", form.label.trim());

    // 楽観的更新: 編集はそのID、新規（個別）は一時ID、新規（全員）はスタッフ毎に一時ID
    const targetStaffId = form.staffId ? Number(form.staffId) : null;
    let optimisticAction:
      | Parameters<NonNullable<typeof onOptimistic>>[0]
      | null = null;
    if (initial?.id) {
      optimisticAction = {
        type: "update",
        row: buildBlockRow(initial.staffId ?? 0, initial.id),
      };
    } else if (targetStaffId) {
      optimisticAction = {
        type: "add",
        row: buildBlockRow(targetStaffId, -Date.now()),
      };
    } else {
      const base = -Date.now();
      optimisticAction = {
        type: "addMany",
        rows: staffs.map((s, i) => buildBlockRow(s.id, base - i)),
      };
    }

    startTransition(async () => {
      if (optimisticAction) onOptimistic?.(optimisticAction);
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
      onOptimistic?.({ type: "delete", id: initial.id });
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
