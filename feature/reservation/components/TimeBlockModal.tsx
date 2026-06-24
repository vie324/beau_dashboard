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
  equipments,
  initial,
  prefill,
  onOptimistic,
}: {
  open: boolean;
  onClose: () => void;
  date: string;
  staffs: { id: number; name: string }[];
  equipments?: { id: number; name: string }[];
  initial?: ReservationRow | null;
  prefill?: {
    staffId?: number;
    equipmentId?: number;
    startTime?: string;
    durationMin?: number;
  };
  onOptimistic?: ReservationOptimisticDispatch;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isEdit = Boolean(initial);
  // 設備モード: initial か prefill のどちらかに equipmentId が入っていれば設備ブロックとして扱う。
  // この場合 staffId は使わず、スタッフ列の切替UIも出さない。
  const initialEquipmentId = initial?.equipmentId ?? prefill?.equipmentId ?? null;
  const isEquipmentMode = initialEquipmentId != null;
  const equipmentName = isEquipmentMode
    ? (equipments?.find((eq) => eq.id === initialEquipmentId)?.name ??
      "（設備）")
    : null;

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

  function buildBlockRow(
    target: { staffId: number | null; equipmentId: number | null },
    idOverride: number,
  ): ReservationRow {
    const startAt = jstDateTimeToDate(form.date, form.startTime);
    const endAt = addMinutes(startAt, form.durationMin);
    const staff = target.staffId
      ? (staffs.find((s) => s.id === target.staffId) ?? null)
      : null;
    return {
      id: idOverride,
      shopId: initial?.shopId ?? 0,
      customerId: null,
      staffId: target.staffId,
      equipmentId: target.equipmentId,
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
    if (isEquipmentMode && initialEquipmentId) {
      fd.set("equipmentId", String(initialEquipmentId));
    } else if (form.staffId) {
      fd.set("staffId", String(form.staffId));
    }
    if (form.label.trim()) fd.set("label", form.label.trim());

    // 楽観的更新: 編集はそのID、新規（個別）は一時ID、新規（全員）はスタッフ毎に一時ID
    const targetStaffId = form.staffId ? Number(form.staffId) : null;
    let optimisticAction:
      | Parameters<NonNullable<typeof onOptimistic>>[0]
      | null = null;
    if (initial?.id) {
      optimisticAction = {
        type: "update",
        row: buildBlockRow(
          {
            staffId: initial.staffId ?? null,
            equipmentId: initial.equipmentId ?? null,
          },
          initial.id,
        ),
      };
    } else if (isEquipmentMode && initialEquipmentId) {
      optimisticAction = {
        type: "add",
        row: buildBlockRow(
          { staffId: null, equipmentId: initialEquipmentId },
          -Date.now(),
        ),
      };
    } else if (targetStaffId) {
      optimisticAction = {
        type: "add",
        row: buildBlockRow(
          { staffId: targetStaffId, equipmentId: null },
          -Date.now(),
        ),
      };
    } else {
      const base = -Date.now();
      optimisticAction = {
        type: "addMany",
        rows: staffs.map((s, i) =>
          buildBlockRow({ staffId: s.id, equipmentId: null }, base - i),
        ),
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
      title={
        isEdit
          ? isEquipmentMode
            ? "設備ブロックの編集"
            : "時間ブロックの編集"
          : isEquipmentMode
            ? "設備ブロックを追加"
            : "時間ブロックを追加"
      }
    >
      <div className="space-y-4">
        <p className="rounded-xl border border-line bg-base/50 px-3 py-2 text-xs text-muted">
          {isEquipmentMode
            ? "メンテナンス等で設備を使用不可にしたい時間を確保します。指定設備の予約枠を埋めるだけで、お客様への通知などは行いません。"
            : "休憩・会議・私用などで予約を入れたくない時間を確保します。指定スタッフの予約枠を埋めるだけで、お客様への通知などは行いません。"}
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>日付</Label>
            <Input
              type="date"
              value={form.date}
              onChange={(e) => set("date", e.target.value)}
              className="date-input-tight"
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
            {isEquipmentMode ? (
              <>
                <Label>対象設備</Label>
                <div className="flex h-10 items-center rounded-xl border border-line bg-base/50 px-3 text-sm text-ink">
                  {equipmentName}
                </div>
                <p className="mt-1 text-[11px] text-faint">
                  設備ブロックは対象を変更できません。別の設備に変える場合は削除して再作成してください。
                </p>
              </>
            ) : (
              <>
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
              </>
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
