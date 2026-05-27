"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { jstMinutesOfDay } from "@/helper/utils/time";
import { moveReservation } from "@/feature/reservation/actions/reservationActions";
import type { ReservationRow } from "@/feature/reservation/services/getReservations";
import type { ReservationOptimisticDispatch } from "@/feature/reservation/types/optimistic";

function minToTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export type MoveTarget = {
  row: ReservationRow;
  date: string;
  newStartMin: number;
  newStaffId: number | null;
  newStaffName: string;
  newStaffColor: string | null;
};

/**
 * カレンダー上で予約カードをドラッグして離した後、移動内容を確認するモーダル。
 * 確定で moveReservation アクションを呼ぶ。予約は長さを維持したまま移動する。
 */
export function MoveConfirmModal({
  open,
  target,
  onClose,
  onOptimistic,
}: {
  open: boolean;
  target: MoveTarget | null;
  onClose: () => void;
  onOptimistic?: ReservationOptimisticDispatch;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!target) return null;

  const { row, date, newStartMin, newStaffId, newStaffName, newStaffColor } =
    target;
  const fromStartMin = jstMinutesOfDay(new Date(row.startAt));
  const fromEndMin = jstMinutesOfDay(new Date(row.endAt));
  const duration = Math.max(15, fromEndMin - fromStartMin);
  const newEndMin = newStartMin + duration;
  const fromStaffName = row.staff?.name ?? "指名なし";
  const subject =
    row.kind === "block"
      ? (row.blockLabel ?? "時間ブロック")
      : (row.customer?.name ?? row.guestName ?? "（名称未設定）");
  const unchanged =
    newStartMin === fromStartMin &&
    (newStaffId ?? null) === (row.staffId ?? null);

  const submit = () => {
    setError(null);
    const deltaMs = (newStartMin - fromStartMin) * 60_000;
    const optimisticRow: ReservationRow = {
      ...row,
      staffId: newStaffId,
      staff:
        newStaffId == null
          ? null
          : newStaffId === row.staffId
            ? row.staff
            : {
                id: newStaffId,
                name: newStaffName,
                // ReservationRow.staff.color は schema 上 non-null (default あり)。
                // 列ヘッダの color が落ちている場合の保険でデフォルトに揃える。
                color: newStaffColor ?? "#a9803f",
              },
      startAt: new Date(new Date(row.startAt).getTime() + deltaMs),
      endAt: new Date(new Date(row.endAt).getTime() + deltaMs),
    };
    startTransition(async () => {
      onOptimistic?.({ type: "update", row: optimisticRow });
      const res = await moveReservation({
        id: row.id,
        date,
        startTime: minToTime(newStartMin),
        staffId: newStaffId,
      });
      if (res.ok) {
        onClose();
        router.refresh();
      } else {
        setError(res.error ?? "移動に失敗しました");
        router.refresh();
      }
    });
  };

  return (
    <Modal open={open} onClose={onClose} title="予約を移動">
      <div className="space-y-4 text-sm">
        <p className="text-ink">
          <span className="font-medium">{subject}</span> を以下の内容で移動します。
        </p>

        <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 rounded-lg border border-line bg-base/40 px-4 py-3 text-ink">
          <span className="text-faint">変更前</span>
          <span className="tabular-nums">
            {minToTime(fromStartMin)}–{minToTime(fromEndMin)}（{fromStaffName}）
          </span>
          <span className="text-faint">変更後</span>
          <span className="tabular-nums font-semibold">
            {minToTime(newStartMin)}–{minToTime(newEndMin)}（{newStaffName}）
          </span>
        </div>

        {unchanged && (
          <p className="rounded-md border border-line bg-elevated/40 px-3 py-2 text-xs text-muted">
            移動先が現在の時刻と同じです。確定しても変更されません。
          </p>
        )}

        {error && (
          <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={pending}>
            キャンセル
          </Button>
          <Button onClick={submit} disabled={pending || unchanged}>
            {pending ? "移動中..." : "移動する"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
