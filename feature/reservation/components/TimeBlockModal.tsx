"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select } from "@/components/ui/Input";
import { timeSlots } from "@/helper/utils/timeOptions";
import { addMinutes, jstDateTimeToDate } from "@/helper/utils/time";
import { staffWorksOn } from "@/helper/utils/staffWork";
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
  staffs: {
    id: number;
    name: string;
    spotMode?: boolean;
    workDates?: string | null;
  }[];
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
  // 削除はネイティブ confirm() ではなくフッター内のインライン確認に置き換える。
  const [confirmingDelete, setConfirmingDelete] = useState(false);

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

  // 設備ブロックのときは equipmentId、スタッフブロックのときは staffId が入る。
  // どちらも空 = 「全員」（その日に出勤するスタッフ全員に1件ずつ作る）。
  const initialEquipmentId =
    initial?.equipmentId ?? prefill?.equipmentId ?? null;
  const [form, setForm] = useState({
    date: initial ? toDateStr(initial.startAt) : date,
    startTime: initial
      ? toTime(initial.startAt)
      : (prefill?.startTime ?? "12:00"),
    durationMin: initial ? initialDuration : (prefill?.durationMin ?? 60),
    staffId:
      initialEquipmentId != null
        ? ""
        : (initial?.staffId ?? prefill?.staffId ?? ""),
    equipmentId: (initialEquipmentId ?? "") as number | "",
    label: initial?.blockLabel ?? "",
  });

  const set = <K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K],
  ) => setForm((f) => ({ ...f, [key]: value }));

  // 対象の選択でモードが切り替わる（新規作成時はスタッフ⇔設備を行き来できる）。
  const isEquipmentMode = form.equipmentId !== "";
  const selectedEquipmentId = isEquipmentMode ? Number(form.equipmentId) : null;

  // ブロックの対象にできるのは その日に出勤するスタッフだけ。
  // 臨時スタッフの出勤日以外はそもそも予約枠が出ないためブロック不要で、
  // ブロックを作ると予約表に勤務外の列が復活してしまう（サーバー側も同じ判定）。
  const blockableStaffs = useMemo(
    () => staffs.filter((s) => staffWorksOn(s, form.date)),
    [staffs, form.date],
  );

  // 既存ブロックを開いたときは、対象者が勤務外でも選択肢に残す（表示が空欄に
  // ならないように）。新規作成では出勤者だけを出す。
  const staffOptions = useMemo(() => {
    const selected = form.staffId === "" ? null : Number(form.staffId);
    if (selected == null || blockableStaffs.some((s) => s.id === selected)) {
      return blockableStaffs;
    }
    const current = staffs.find((s) => s.id === selected);
    return current ? [current, ...blockableStaffs] : blockableStaffs;
  }, [blockableStaffs, staffs, form.staffId]);

  // 設備の選択肢。既存ブロックの設備が後から「予約不可」にされて一覧から
  // 外れていても、表示が空欄にならないように選択肢へ足しておく。
  const equipmentOptions = useMemo(() => {
    const list = equipments ?? [];
    if (
      selectedEquipmentId == null ||
      list.some((eq) => eq.id === selectedEquipmentId)
    ) {
      return list;
    }
    const name = initial?.equipment?.name ?? "（設備）";
    return [{ id: selectedEquipmentId, name }, ...list];
  }, [equipments, selectedEquipmentId, initial]);

  // <select> の値: "" = 全員 / "s:<id>" = スタッフ / "e:<id>" = 設備
  const targetValue = isEquipmentMode
    ? `e:${form.equipmentId}`
    : form.staffId === ""
      ? ""
      : `s:${form.staffId}`;
  const setTarget = (value: string) => {
    if (value.startsWith("e:")) {
      setForm((f) => ({ ...f, equipmentId: Number(value.slice(2)), staffId: "" }));
    } else if (value.startsWith("s:")) {
      setForm((f) => ({ ...f, staffId: Number(value.slice(2)), equipmentId: "" }));
    } else {
      setForm((f) => ({ ...f, staffId: "", equipmentId: "" }));
    }
  };

  function buildBlockRow(
    target: { staffId: number | null; equipmentId: number | null },
    idOverride: number,
  ): ReservationRow {
    const startAt = jstDateTimeToDate(form.date, form.startTime);
    const endAt = addMinutes(startAt, form.durationMin);
    const staff = target.staffId
      ? (staffs.find((s) => s.id === target.staffId) ?? null)
      : null;
    const equipment = target.equipmentId
      ? (equipmentOptions.find((eq) => eq.id === target.equipmentId) ?? null)
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
      equipment: equipment
        ? { id: equipment.id, name: equipment.name, color: null }
        : null,
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
    if (selectedEquipmentId != null) {
      fd.set("equipmentId", String(selectedEquipmentId));
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
    } else if (selectedEquipmentId != null) {
      optimisticAction = {
        type: "add",
        row: buildBlockRow(
          { staffId: null, equipmentId: selectedEquipmentId },
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
        rows: blockableStaffs.map((s, i) =>
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
    startTransition(async () => {
      onOptimistic?.({ type: "delete", id: initial.id });
      const res = await deleteTimeBlock(initial.id);
      if (res.ok) {
        onClose();
        router.refresh();
      } else {
        setError(res.error);
        setConfirmingDelete(false);
      }
    });
  }

  const footer = confirmingDelete ? (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-ink">削除しますか？</span>
      <div className="flex gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setConfirmingDelete(false)}
          disabled={pending}
        >
          キャンセル
        </Button>
        <Button variant="danger" size="sm" onClick={remove} disabled={pending}>
          {pending ? "削除中…" : "削除する"}
        </Button>
      </div>
    </div>
  ) : (
    <div className="flex items-center justify-between">
      {isEdit ? (
        <Button
          variant="danger"
          size="sm"
          onClick={() => setConfirmingDelete(true)}
          disabled={pending}
        >
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
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      footer={footer}
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
            <Label>対象</Label>
            <Select
              value={targetValue}
              onChange={(e) => setTarget(e.target.value)}
              disabled={isEdit}
            >
              <optgroup label="スタッフ">
                <option value="">全員</option>
                {staffOptions.map((s) => (
                  <option key={`s${s.id}`} value={`s:${s.id}`}>
                    {s.name}
                  </option>
                ))}
              </optgroup>
              {equipmentOptions.length > 0 && (
                <optgroup label="設備">
                  {equipmentOptions.map((eq) => (
                    <option key={`e${eq.id}`} value={`e:${eq.id}`}>
                      {eq.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </Select>
            {isEdit && (
              <p className="mt-1 text-[11px] text-faint">
                対象の変更は一度削除して再作成してください。
              </p>
            )}
          </div>
        </div>

        <div>
          <Label>内容（任意）</Label>
          <Input
            value={form.label}
            onChange={(e) => set("label", e.target.value)}
            placeholder={
              isEquipmentMode
                ? "メンテナンス / 清掃 / 故障 など"
                : "休憩 / 会議 / 私用 など"
            }
            maxLength={40}
          />
        </div>

        {error && (
          <p className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
