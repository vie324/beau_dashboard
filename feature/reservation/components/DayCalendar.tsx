"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { statusMeta } from "@/helper/utils/status";
import { jstMinutesOfDay } from "@/helper/utils/time";
import { assignLanes } from "@/helper/utils/laneLayout";
import type { ReservationRow } from "@/feature/reservation/services/getReservations";

const PX_PER_MIN = 1; // 縦軸の高さ（1分=1px → 1時間=60px）
const MIN_COL_W = 150; // 列（スタッフ/設備）の最小幅。列が少なければ幅いっぱいに広がる。
const GUTTER_W = 56; // 左の時刻目盛り幅
const HEAD_H = 36;

type Col = {
  key: string;
  staffId: number | null;
  equipmentId: number | null;
  name: string;
  color?: string;
};

function jstMinutes(d: Date): number {
  return jstMinutesOfDay(new Date(d));
}

function minToTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Google カレンダー風の縦タイムライン表示。
 * 縦軸=時間、横軸=スタッフ/設備の列。重なる予約は列内でレーン分割して横並び。
 * - カードのクリックで編集
 * - 空き部分のクリックで新規予約
 * - 空き部分を縦にドラッグ（引き伸ばし）で時間ブロックを作成
 */
export function DayCalendar({
  date,
  today,
  reservations,
  cols,
  startMin,
  endMin,
  breakBand,
  nowMin,
  onCardClick,
  onEmptyClick,
  onDragCreate,
}: {
  date: string;
  today: string;
  reservations: ReservationRow[];
  cols: Col[];
  startMin: number;
  endMin: number;
  breakBand: { bs: number; be: number } | null;
  nowMin: number | null;
  onCardClick: (r: ReservationRow) => void;
  onEmptyClick: (staffId: number | null, startTime: string) => void;
  onDragCreate: (
    staffId: number | null,
    startTime: string,
    durationMin: number,
  ) => void;
}) {
  const totalH = (endMin - startMin) * PX_PER_MIN;

  const hours: number[] = [];
  for (let m = Math.ceil(startMin / 60) * 60; m <= endMin; m += 60) hours.push(m);

  const showNow =
    date === today && nowMin != null && nowMin >= startMin && nowMin <= endMin;

  // 縦ドラッグで時間ブロックを作成（PCのみ）。横タイムラインと同じ操作感。
  const dragRef = useRef<{
    startClientY: number;
    colEl: HTMLElement;
    staffId: number | null;
    colKey: string;
    a: number;
    b: number;
    moved: boolean;
  } | null>(null);
  const [dragSel, setDragSel] = useState<{
    colKey: string;
    startMin: number;
    endMin: number;
  } | null>(null);
  const suppressClickRef = useRef(false);

  const byCol = (c: Col) =>
    reservations.filter((r) => {
      if (c.staffId != null) return r.staffId === c.staffId;
      if (c.equipmentId != null)
        return r.staffId == null && r.equipmentId === c.equipmentId;
      return r.staffId == null && r.equipmentId == null;
    });

  return (
    <div
      className="hidden overflow-auto rounded-xl border border-line bg-surface shadow-panel sm:block"
      style={{ maxHeight: "72vh" }}
    >
      <div style={{ minWidth: GUTTER_W + cols.length * MIN_COL_W }}>
        {/* Header: column names */}
        <div
          className="sticky top-0 z-30 flex border-b border-line bg-surface"
          style={{ height: HEAD_H }}
        >
          <div
            className="sticky left-0 z-10 shrink-0 border-r border-line bg-surface"
            style={{ width: GUTTER_W }}
          />
          {cols.map((c) => (
            <div
              key={c.key}
              className="flex flex-1 items-center gap-1.5 border-r border-line px-2 text-xs font-medium text-ink last:border-r-0"
              style={{ minWidth: MIN_COL_W }}
            >
              {c.color && (
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-line"
                  style={{ background: c.color }}
                />
              )}
              {c.staffId != null ? (
                <Link
                  href={`/reservation/staff/${c.staffId}?date=${date}`}
                  className="truncate underline-offset-2 hover:text-accent hover:underline"
                  title={`${c.name}の週間スケジュールを表示`}
                >
                  {c.name}
                </Link>
              ) : (
                <span className="truncate">{c.name}</span>
              )}
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="relative flex">
          {/* Time gutter */}
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

          {/* Columns */}
          {cols.map((col) => {
            const items = byCol(col);
            const laneMap = assignLanes(
              items.map((r) => ({
                id: r.id,
                start: jstMinutes(r.startAt),
                end: Math.max(jstMinutes(r.endAt), jstMinutes(r.startAt) + 15),
              })),
            );
            return (
              <div
                key={col.key}
                className="relative flex-1 cursor-copy border-r border-line last:border-r-0"
                style={{ minWidth: MIN_COL_W, height: totalH }}
                onMouseDown={(e) => {
                  if (e.button !== 0) return;
                  // 設備列・「指名なし」列は対象スタッフが無いためドラッグ作成不可。
                  if (col.staffId == null) return;
                  const colEl = e.currentTarget as HTMLElement;
                  const rect = colEl.getBoundingClientRect();
                  const y0 = e.clientY - rect.top;
                  const raw0 = startMin + y0 / PX_PER_MIN;
                  const a = Math.max(
                    startMin,
                    Math.min(endMin - 15, Math.round(raw0 / 15) * 15),
                  );
                  dragRef.current = {
                    startClientY: e.clientY,
                    colEl,
                    staffId: col.staffId,
                    colKey: col.key,
                    a,
                    b: a,
                    moved: false,
                  };
                  const onMove = (ev: MouseEvent) => {
                    const d = dragRef.current;
                    if (!d) return;
                    if (
                      !d.moved &&
                      Math.abs(ev.clientY - d.startClientY) < 5
                    )
                      return;
                    d.moved = true;
                    const r = d.colEl.getBoundingClientRect();
                    const y = ev.clientY - r.top;
                    const rawT = startMin + y / PX_PER_MIN;
                    const snappedT = Math.max(
                      startMin,
                      Math.min(endMin, Math.round(rawT / 15) * 15),
                    );
                    d.b = snappedT;
                    setDragSel({
                      colKey: d.colKey,
                      startMin: Math.min(d.a, d.b),
                      endMin: Math.max(d.a, d.b),
                    });
                  };
                  const onUp = () => {
                    document.removeEventListener("mousemove", onMove);
                    document.removeEventListener("mouseup", onUp);
                    const d = dragRef.current;
                    dragRef.current = null;
                    if (!d) return;
                    if (d.moved) {
                      const lo = Math.min(d.a, d.b);
                      const hi = Math.max(d.a, d.b);
                      const duration = Math.max(15, hi - lo);
                      suppressClickRef.current = true;
                      onDragCreate(d.staffId, minToTime(lo), duration);
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
                  const y = e.clientY - rect.top;
                  const raw = startMin + y / PX_PER_MIN;
                  const snapped = Math.min(
                    endMin - 15,
                    Math.max(startMin, Math.round(raw / 15) * 15),
                  );
                  onEmptyClick(col.staffId, minToTime(snapped));
                }}
              >
                {/* Hour gridlines */}
                {hours.map((m) => (
                  <div
                    key={m}
                    className="absolute inset-x-0 border-t border-line/40"
                    style={{ top: (m - startMin) * PX_PER_MIN }}
                  />
                ))}

                {/* Break band */}
                {breakBand &&
                  breakBand.be > startMin &&
                  breakBand.bs < endMin && (
                    <div
                      className="pointer-events-none absolute inset-x-0 bg-line/30"
                      style={{
                        top:
                          (Math.max(breakBand.bs, startMin) - startMin) *
                          PX_PER_MIN,
                        height:
                          (Math.min(breakBand.be, endMin) -
                            Math.max(breakBand.bs, startMin)) *
                          PX_PER_MIN,
                      }}
                    />
                  )}

                {/* Now cursor */}
                {showNow && (
                  <div
                    className="pointer-events-none absolute inset-x-0 z-20 h-0.5 bg-danger/80"
                    style={{ top: (nowMin! - startMin) * PX_PER_MIN }}
                  />
                )}

                {/* Drag-to-create selection */}
                {dragSel && dragSel.colKey === col.key && (
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

                {/* Cards */}
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
                          onCardClick(r);
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
                        onCardClick(r);
                      }}
                      title={`${minToTime(s)}–${minToTime(e)} ${name}${r.note ? `\n${r.note}` : ""}`}
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
                      {height < 36 ? (
                        // 30分以下のカードは1行に集約（時刻 + No. + 名前 + メモ）
                        // 名前とメモは個別に truncate して、長い名前でもメモが完全に消えないようにする。
                        <div className="flex items-center gap-1 overflow-hidden leading-tight">
                          <span className="shrink-0 font-semibold tabular-nums text-ink">
                            {minToTime(s)}
                          </span>
                          {r.customer?.code && (
                            <span className="shrink-0 text-faint tabular-nums">
                              No.{r.customer.code}
                            </span>
                          )}
                          <span className="min-w-0 truncate font-medium text-ink">
                            {name}
                          </span>
                          {r.note && (
                            <span
                              className="min-w-0 truncate text-faint"
                              title={r.note}
                            >
                              — {r.note}
                            </span>
                          )}
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center justify-between gap-1">
                            <span className="truncate font-semibold tabular-nums text-ink">
                              {minToTime(s)}
                            </span>
                            <Badge
                              className={`${meta.className} shrink-0 whitespace-nowrap`}
                            >
                              {meta.label}
                            </Badge>
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
                            <div className="truncate text-faint">{r.menu.name}</div>
                          )}
                        </>
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
  );
}
