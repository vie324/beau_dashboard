"use client";

import { Badge } from "@/components/ui/Badge";
import { statusMeta } from "@/helper/utils/status";
import { jstMinutesOfDay } from "@/helper/utils/time";
import { assignLanes } from "@/helper/utils/laneLayout";
import type { ReservationRow } from "@/feature/reservation/services/getReservations";

const PX_PER_MIN = 1; // 縦軸の高さ（1分=1px → 1時間=60px）
const COL_W = 150; // 列（スタッフ/設備）の幅
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
 * カードのクリックで編集、空き部分のクリックで新規作成。
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
}) {
  const totalH = (endMin - startMin) * PX_PER_MIN;

  const hours: number[] = [];
  for (let m = Math.ceil(startMin / 60) * 60; m <= endMin; m += 60) hours.push(m);

  const showNow =
    date === today && nowMin != null && nowMin >= startMin && nowMin <= endMin;

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
      <div style={{ width: GUTTER_W + cols.length * COL_W, minWidth: "100%" }}>
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
              className="flex shrink-0 items-center gap-1.5 border-r border-line px-2 text-xs font-medium text-ink"
              style={{ width: COL_W }}
            >
              {c.color && (
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-line"
                  style={{ background: c.color }}
                />
              )}
              <span className="truncate">{c.name}</span>
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
                className="relative shrink-0 cursor-copy border-r border-line last:border-r-0"
                style={{ width: COL_W, height: totalH }}
                onClick={(e) => {
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
                      onClick={(ev) => {
                        ev.stopPropagation();
                        onCardClick(r);
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
                      <div className="truncate font-medium text-ink">
                        {name}
                      </div>
                      {r.menu && height > 48 && (
                        <div className="truncate text-faint">{r.menu.name}</div>
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
