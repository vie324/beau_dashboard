"use client";

import { useEffect, useMemo, useOptimistic, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { statusMeta } from "@/helper/utils/status";
import {
  jstMinutesOfDay,
  toLocalDateString,
  shiftDateString,
  dayOfWeekFromYmd,
  formatJpDate,
} from "@/helper/utils/time";
import { assignLanes } from "@/helper/utils/laneLayout";
import { AppointmentModal } from "@/feature/reservation/components/AppointmentModal";
import { TimeBlockModal } from "@/feature/reservation/components/TimeBlockModal";
import type { ReservationRow } from "@/feature/reservation/services/getReservations";
import type { ReservationOptimisticAction } from "@/feature/reservation/types/optimistic";

const PX_PER_MIN = 1;
const MIN_COL_W = 130;
const GUTTER_W = 52;
const HEAD_H = 48;
const WD = ["日", "月", "火", "水", "木", "金", "土"];

type FormData = React.ComponentProps<typeof AppointmentModal>["formData"];

type Day = {
  dateStr: string;
  dow: number;
  isClosed: boolean;
  breakStartMin: number | null;
  breakEndMin: number | null;
};

function minToTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function mondayOf(dateStr: string): string {
  const dow = dayOfWeekFromYmd(dateStr);
  return shiftDateString(dateStr, -((dow + 6) % 7));
}

export function StaffWeekBoard({
  staff,
  weekStart,
  refDate,
  today,
  days,
  startMin,
  endMin,
  reservations: reservationsProp,
  formData,
}: {
  staff: { id: number; name: string; color: string | null };
  weekStart: string;
  refDate: string;
  today: string;
  days: Day[];
  startMin: number;
  endMin: number;
  reservations: ReservationRow[];
  formData: FormData;
}) {
  const router = useRouter();

  const [reservations, applyOptimistic] = useOptimistic<
    ReservationRow[],
    ReservationOptimisticAction
  >(reservationsProp, (state, action) => {
    const byStart = (a: ReservationRow, b: ReservationRow) =>
      new Date(a.startAt).getTime() - new Date(b.startAt).getTime();
    switch (action.type) {
      case "add":
        return [
          ...state.filter((r) => r.id !== action.row.id),
          action.row,
        ].sort(byStart);
      case "addMany": {
        const ids = new Set(action.rows.map((r) => r.id));
        return [...state.filter((r) => !ids.has(r.id)), ...action.rows].sort(
          byStart,
        );
      }
      case "update":
        return state.map((r) => (r.id === action.row.id ? action.row : r));
      case "delete":
        return state.filter((r) => r.id !== action.id);
    }
  });

  type ModalState =
    | {
        kind: "appointment";
        mode: "create";
        date: string;
        prefill?: { staffId?: number; startTime?: string };
      }
    | { kind: "appointment"; mode: "edit"; row: ReservationRow }
    | {
        kind: "block";
        mode: "create";
        date: string;
        prefill?: { staffId?: number; startTime?: string; durationMin?: number };
      }
    | { kind: "block"; mode: "edit"; row: ReservationRow };
  const [modal, setModal] = useState<ModalState | null>(null);
  const openCardEdit = (r: ReservationRow) =>
    setModal(
      r.kind === "block"
        ? { kind: "block", mode: "edit", row: r }
        : { kind: "appointment", mode: "edit", row: r },
    );

  const [nowMin, setNowMin] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNowMin(jstMinutesOfDay(new Date()));
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);

  // 縦ドラッグで時間ブロック作成（PCのみ）。
  const dragRef = useRef<{
    startClientY: number;
    colEl: HTMLElement;
    date: string;
    a: number;
    b: number;
    moved: boolean;
  } | null>(null);
  const [dragSel, setDragSel] = useState<{
    date: string;
    startMin: number;
    endMin: number;
  } | null>(null);
  const suppressClickRef = useRef(false);

  const totalH = (endMin - startMin) * PX_PER_MIN;
  const hours = useMemo(() => {
    const a: number[] = [];
    for (let m = Math.ceil(startMin / 60) * 60; m <= endMin; m += 60) a.push(m);
    return a;
  }, [startMin, endMin]);

  const byDay = (dateStr: string) =>
    reservations.filter(
      (r) =>
        r.staffId === staff.id &&
        toLocalDateString(new Date(r.startAt)) === dateStr,
    );

  const goWeek = (mondayStr: string) =>
    router.push(`/reservation/staff/${staff.id}?date=${mondayStr}`);
  const weekEnd = shiftDateString(weekStart, 6);

  const headColor = (d: Day) =>
    d.dateStr === today
      ? "text-accent"
      : d.dow === 0
        ? "text-danger"
        : "text-ink";

  return (
    <>
      <div className="mb-5 flex flex-col gap-3">
        <Link
          href={`/reservation?date=${refDate}`}
          className="inline-flex w-fit items-center gap-1 text-sm text-muted transition-colors hover:text-ink"
        >
          ‹ 予約管理へ戻る
        </Link>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            {staff.color && (
              <span
                className="h-3 w-3 shrink-0 rounded-full ring-1 ring-line"
                style={{ background: staff.color }}
              />
            )}
            <h1 className="text-xl font-semibold text-ink">
              {staff.name}
            </h1>
            <span className="text-sm text-muted">の週間スケジュール</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => goWeek(shiftDateString(weekStart, -7))}
            >
              ‹ 前週
            </Button>
            <Button
              size="sm"
              variant={weekStart === mondayOf(today) ? "primary" : "ghost"}
              onClick={() => goWeek(mondayOf(today))}
            >
              今週
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => goWeek(shiftDateString(weekStart, 7))}
            >
              翌週 ›
            </Button>
            <span className="ml-1 hidden text-xs tabular-nums text-faint lg:inline">
              {formatJpDate(weekStart)} 〜 {formatJpDate(weekEnd)}
            </span>
          </div>
        </div>
      </div>

      {/* PC: 縦タイムラインの週グリッド */}
      <div
        className="hidden overflow-auto rounded-xl border border-line bg-surface shadow-panel sm:block"
        style={{ maxHeight: "74vh" }}
      >
        <div style={{ minWidth: GUTTER_W + days.length * MIN_COL_W }}>
          {/* Header: day columns */}
          <div
            className="sticky top-0 z-30 flex border-b border-line bg-surface"
            style={{ height: HEAD_H }}
          >
            <div
              className="sticky left-0 z-10 shrink-0 border-r border-line bg-surface"
              style={{ width: GUTTER_W }}
            />
            {days.map((d) => {
              const [, mm, dd] = d.dateStr.split("-");
              const isToday = d.dateStr === today;
              return (
                <div
                  key={d.dateStr}
                  className={`flex flex-1 flex-col items-center justify-center border-r border-line last:border-r-0 ${
                    isToday ? "bg-accent/10" : ""
                  }`}
                  style={{ minWidth: MIN_COL_W }}
                >
                  <span className={`text-xs font-medium ${headColor(d)}`}>
                    {Number(mm)}/{Number(dd)}（{WD[d.dow]}）
                  </span>
                  {d.isClosed && (
                    <span className="text-[10px] text-faint">休</span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Body */}
          <div className="relative flex">
            <div
              className="sticky left-0 z-20 shrink-0 border-r border-line bg-surface"
              style={{ width: GUTTER_W, height: totalH }}
            >
              {hours.map((m) => (
                <div
                  key={m}
                  className="absolute right-1 -translate-y-1/2 text-[11px] tabular-nums text-faint"
                  style={{ top: (m - startMin) * PX_PER_MIN }}
                >
                  {minToTime(m)}
                </div>
              ))}
            </div>

            {days.map((d) => {
              const items = byDay(d.dateStr);
              const laneMap = assignLanes(
                items.map((r) => ({
                  id: r.id,
                  start: jstMinutes(r.startAt),
                  end: Math.max(jstMinutes(r.endAt), jstMinutes(r.startAt) + 15),
                })),
              );
              const showNow =
                d.dateStr === today &&
                nowMin != null &&
                nowMin >= startMin &&
                nowMin <= endMin;
              return (
                <div
                  key={d.dateStr}
                  className={`relative flex-1 cursor-copy border-r border-line last:border-r-0 ${
                    d.isClosed ? "bg-line/10" : ""
                  }`}
                  style={{ minWidth: MIN_COL_W, height: totalH }}
                  onMouseDown={(e) => {
                    if (e.button !== 0) return;
                    const colEl = e.currentTarget as HTMLElement;
                    const rect = colEl.getBoundingClientRect();
                    const raw0 = startMin + (e.clientY - rect.top) / PX_PER_MIN;
                    const a = Math.max(
                      startMin,
                      Math.min(endMin - 15, Math.round(raw0 / 15) * 15),
                    );
                    dragRef.current = {
                      startClientY: e.clientY,
                      colEl,
                      date: d.dateStr,
                      a,
                      b: a,
                      moved: false,
                    };
                    const onMove = (ev: MouseEvent) => {
                      const dr = dragRef.current;
                      if (!dr) return;
                      if (
                        !dr.moved &&
                        Math.abs(ev.clientY - dr.startClientY) < 5
                      )
                        return;
                      dr.moved = true;
                      const r = dr.colEl.getBoundingClientRect();
                      const rawT = startMin + (ev.clientY - r.top) / PX_PER_MIN;
                      dr.b = Math.max(
                        startMin,
                        Math.min(endMin, Math.round(rawT / 15) * 15),
                      );
                      setDragSel({
                        date: dr.date,
                        startMin: Math.min(dr.a, dr.b),
                        endMin: Math.max(dr.a, dr.b),
                      });
                    };
                    const onUp = () => {
                      document.removeEventListener("mousemove", onMove);
                      document.removeEventListener("mouseup", onUp);
                      const dr = dragRef.current;
                      dragRef.current = null;
                      if (!dr) return;
                      if (dr.moved) {
                        const lo = Math.min(dr.a, dr.b);
                        const hi = Math.max(dr.a, dr.b);
                        suppressClickRef.current = true;
                        setModal({
                          kind: "block",
                          mode: "create",
                          date: dr.date,
                          prefill: {
                            staffId: staff.id,
                            startTime: minToTime(lo),
                            durationMin: Math.max(15, hi - lo),
                          },
                        });
                      }
                      setDragSel(null);
                    };
                    document.addEventListener("mousemove", onMove);
                    document.addEventListener("mouseup", onUp);
                  }}
                  onClick={(e) => {
                    if (suppressClickRef.current) {
                      suppressClickRef.current = false;
                      return;
                    }
                    const rect = (
                      e.currentTarget as HTMLElement
                    ).getBoundingClientRect();
                    const raw = startMin + (e.clientY - rect.top) / PX_PER_MIN;
                    const snapped = Math.min(
                      endMin - 15,
                      Math.max(startMin, Math.round(raw / 15) * 15),
                    );
                    setModal({
                      kind: "appointment",
                      mode: "create",
                      date: d.dateStr,
                      prefill: { staffId: staff.id, startTime: minToTime(snapped) },
                    });
                  }}
                >
                  {hours.map((m) => (
                    <div
                      key={m}
                      className="absolute inset-x-0 border-t border-line/40"
                      style={{ top: (m - startMin) * PX_PER_MIN }}
                    />
                  ))}

                  {d.breakStartMin != null &&
                    d.breakEndMin != null &&
                    d.breakEndMin > startMin &&
                    d.breakStartMin < endMin && (
                      <div
                        className="pointer-events-none absolute inset-x-0 bg-line/30"
                        style={{
                          top:
                            (Math.max(d.breakStartMin, startMin) - startMin) *
                            PX_PER_MIN,
                          height:
                            (Math.min(d.breakEndMin, endMin) -
                              Math.max(d.breakStartMin, startMin)) *
                            PX_PER_MIN,
                        }}
                      />
                    )}

                  {showNow && (
                    <div
                      className="pointer-events-none absolute inset-x-0 z-20 h-0.5 bg-danger/80"
                      style={{ top: (nowMin! - startMin) * PX_PER_MIN }}
                    />
                  )}

                  {dragSel && dragSel.date === d.dateStr && (
                    <div
                      className="pointer-events-none absolute inset-x-1 z-20 rounded-md border-2 border-accent/70 bg-accent/15"
                      style={{
                        top: (dragSel.startMin - startMin) * PX_PER_MIN,
                        height: Math.max(
                          15 * PX_PER_MIN,
                          (dragSel.endMin - dragSel.startMin) * PX_PER_MIN,
                        ),
                      }}
                    >
                      <span className="m-1 inline-block rounded bg-accent px-1 py-0.5 text-[10px] font-semibold leading-none text-accent-fg tabular-nums">
                        {minToTime(dragSel.startMin)}–{minToTime(dragSel.endMin)}
                      </span>
                    </div>
                  )}

                  {items.map((r) => {
                    const s = jstMinutes(r.startAt);
                    const e = jstMinutes(r.endAt);
                    const top = (s - startMin) * PX_PER_MIN;
                    const height = Math.max(
                      20,
                      (Math.max(e, s + 15) - s) * PX_PER_MIN - 2,
                    );
                    const lay = laneMap.get(r.id) ?? { lane: 0, lanes: 1 };
                    const leftStyle = `calc(${(lay.lane / lay.lanes) * 100}% + 2px)`;
                    const widthStyle = `calc(${(1 / lay.lanes) * 100}% - 4px)`;

                    if (r.kind === "block") {
                      const label = r.blockLabel ?? "時間ブロック";
                      return (
                        <button
                          key={r.id}
                          onMouseDown={(ev) => ev.stopPropagation()}
                          onClick={(ev) => {
                            ev.stopPropagation();
                            openCardEdit(r);
                          }}
                          title={`${minToTime(s)}–${minToTime(e)} ${label}`}
                          className="absolute z-10 overflow-hidden rounded-md border border-line px-1.5 py-0.5 text-left text-[10px] text-muted transition-colors hover:z-20 hover:border-accent/70"
                          style={{
                            top,
                            height,
                            left: leftStyle,
                            width: widthStyle,
                            background:
                              "repeating-linear-gradient(45deg, rgba(155,144,121,0.22) 0 6px, rgba(155,144,121,0.08) 6px 12px)",
                          }}
                        >
                          <div className="truncate font-medium text-ink">
                            {label}
                          </div>
                          {height > 28 && (
                            <div className="truncate tabular-nums">
                              {minToTime(s)}–{minToTime(e)}
                            </div>
                          )}
                        </button>
                      );
                    }

                    const meta = statusMeta(r.status);
                    const cancelled = [3, 4, 99].includes(r.status);
                    const name =
                      r.customer?.name ?? r.guestName ?? "（名称未設定）";
                    return (
                      <button
                        key={r.id}
                        onMouseDown={(ev) => ev.stopPropagation()}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          openCardEdit(r);
                        }}
                        title={`${minToTime(s)}–${minToTime(e)} ${name}`}
                        className={`absolute z-10 overflow-hidden rounded-md border px-1.5 py-0.5 text-left text-[10px] shadow-sm transition-colors hover:z-20 hover:border-accent/70 ${
                          cancelled
                            ? "border-line bg-elevated/60 opacity-60"
                            : "border-line bg-elevated"
                        } ${!r.confirmed && !cancelled ? "ring-1 ring-warn" : ""}`}
                        style={{
                          top,
                          height,
                          left: leftStyle,
                          width: widthStyle,
                          borderLeftWidth: 3,
                          borderLeftColor:
                            r.visitSource?.labelTextColor ?? "#d8b06a",
                        }}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="truncate font-semibold tabular-nums text-ink">
                            {minToTime(s)}
                          </span>
                          {height > 34 && (
                            <Badge
                              className={`${meta.className} shrink-0 whitespace-nowrap`}
                            >
                              {meta.label}
                            </Badge>
                          )}
                        </div>
                        <div className="flex min-w-0 items-center gap-1 font-medium text-ink">
                          {r.customer?.code && (
                            <span className="shrink-0 text-faint tabular-nums">
                              No.{r.customer.code}
                            </span>
                          )}
                          <span className="truncate">{name}</span>
                        </div>
                        {r.menu && height > 48 && (
                          <div className="truncate text-faint">
                            {r.menu.name}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* スマホ: 日ごとのリスト */}
      <div className="space-y-3 sm:hidden">
        {days.map((d) => {
          const items = byDay(d.dateStr).slice().sort(
            (a, b) =>
              new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
          );
          const [, mm, dd] = d.dateStr.split("-");
          return (
            <div
              key={d.dateStr}
              className="overflow-hidden rounded-xl border border-line bg-surface shadow-panel"
            >
              <div className="flex items-center justify-between border-b border-line px-3 py-2">
                <span
                  className={`text-sm font-semibold ${
                    d.dateStr === today
                      ? "text-accent"
                      : d.dow === 0
                        ? "text-danger"
                        : "text-ink"
                  }`}
                >
                  {Number(mm)}/{Number(dd)}（{WD[d.dow]}）
                  {d.isClosed && (
                    <span className="ml-1 text-[10px] text-faint">休</span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setModal({
                      kind: "appointment",
                      mode: "create",
                      date: d.dateStr,
                      prefill: { staffId: staff.id },
                    })
                  }
                  className="text-xs font-medium text-accent"
                >
                  ＋ 予約
                </button>
              </div>
              {items.length === 0 ? (
                <p className="px-3 py-3 text-xs text-faint">予約はありません</p>
              ) : (
                <ul className="divide-y divide-line/70">
                  {items.map((r) => {
                    const s = jstMinutes(r.startAt);
                    const e = jstMinutes(r.endAt);
                    const cancelled = [3, 4, 99].includes(r.status);
                    const isBlock = r.kind === "block";
                    const name = isBlock
                      ? (r.blockLabel ?? "時間ブロック")
                      : (r.customer?.name ?? r.guestName ?? "（名称未設定）");
                    const meta = statusMeta(r.status);
                    return (
                      <li key={r.id}>
                        <button
                          onClick={() => openCardEdit(r)}
                          className={`flex w-full items-center gap-3 px-3 py-2 text-left active:bg-elevated/60 ${
                            cancelled ? "opacity-60" : ""
                          }`}
                        >
                          <span className="w-20 shrink-0 text-xs font-semibold tabular-nums text-ink">
                            {minToTime(s)}–{minToTime(e)}
                          </span>
                          <span className="flex min-w-0 flex-1 items-center gap-1 text-sm text-ink">
                            {!isBlock && r.customer?.code && (
                              <span className="shrink-0 text-xs text-faint tabular-nums">
                                No.{r.customer.code}
                              </span>
                            )}
                            <span className="truncate">{name}</span>
                          </span>
                          {!isBlock && (
                            <Badge
                              className={`${meta.className} shrink-0 whitespace-nowrap`}
                            >
                              {meta.label}
                            </Badge>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {modal?.kind === "appointment" && (
        <AppointmentModal
          key={
            modal.mode === "edit"
              ? `e${modal.row.id}`
              : `c${modal.date}-${modal.prefill?.startTime ?? ""}`
          }
          open
          onClose={() => setModal(null)}
          date={modal.mode === "edit" ? refDate : modal.date}
          formData={formData}
          initial={modal.mode === "edit" ? modal.row : null}
          prefill={modal.mode === "create" ? modal.prefill : undefined}
          onOptimistic={applyOptimistic}
        />
      )}
      {modal?.kind === "block" && (
        <TimeBlockModal
          key={
            modal.mode === "edit"
              ? `be${modal.row.id}`
              : `bc${modal.date}-${modal.prefill?.startTime ?? ""}`
          }
          open
          onClose={() => setModal(null)}
          date={modal.mode === "edit" ? refDate : modal.date}
          staffs={formData.staffs}
          initial={modal.mode === "edit" ? modal.row : null}
          prefill={modal.mode === "create" ? modal.prefill : undefined}
          onOptimistic={applyOptimistic}
        />
      )}
    </>
  );
}

function jstMinutes(d: Date): number {
  return jstMinutesOfDay(new Date(d));
}
