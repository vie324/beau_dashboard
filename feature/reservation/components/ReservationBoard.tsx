"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { statusMeta } from "@/helper/utils/status";
import { jstMinutesOfDay } from "@/helper/utils/time";
import { DateNav } from "@/feature/reservation/components/DateNav";
import { AppointmentModal } from "@/feature/reservation/components/AppointmentModal";
import type { ReservationRow } from "@/feature/reservation/services/getReservations";

const BASE_START = 9 * 60; // 09:00 default window
const BASE_END = 21 * 60; // 21:00
const PX_PER_MIN = 1.7;
const ROW_H = 76; // px per staff row
const STAFF_W = 152; // px sticky staff-name column
const HEAD_H = 40;

function jstMinutes(d: Date): number {
  return jstMinutesOfDay(new Date(d));
}

function minToTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

type FormData = React.ComponentProps<typeof AppointmentModal>["formData"];

export function ReservationBoard({
  date,
  today,
  reservations,
  formData,
}: {
  date: string;
  today: string;
  reservations: ReservationRow[];
  formData: FormData;
}) {
  const [modal, setModal] = useState<
    | { mode: "create"; prefill?: { staffId?: number; startTime?: string } }
    | { mode: "edit"; row: ReservationRow }
    | null
  >(null);

  // Live "now" in minutes (JST), refreshed every 30s — drives the time cursor.
  const [nowMin, setNowMin] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNowMin(jstMinutesOfDay(new Date()));
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);

  const rows = useMemo(() => {
    const r = formData.staffs.map((s) => ({
      key: `staff-${s.id}`,
      staffId: s.id as number | null,
      name: s.name,
      color: s.color as string | undefined,
    }));
    const hasUnassigned = reservations.some((x) => x.staffId == null);
    if (hasUnassigned || r.length === 0) {
      r.push({
        key: "unassigned",
        staffId: null,
        name: "指名なし",
        color: undefined,
      });
    }
    return r;
  }, [formData.staffs, reservations]);

  const { startMin, endMin } = useMemo(() => {
    let start = BASE_START;
    let end = BASE_END;
    for (const r of reservations) {
      const s = jstMinutes(r.startAt);
      const e = jstMinutes(r.endAt);
      if (s < start) start = Math.floor(s / 60) * 60;
      if (e > end) end = Math.ceil(e / 60) * 60;
    }
    return { startMin: Math.max(0, start), endMin: Math.min(24 * 60, end) };
  }, [reservations]);

  const totalW = (endMin - startMin) * PX_PER_MIN;

  const hours = useMemo(() => {
    const arr: number[] = [];
    for (let m = Math.ceil(startMin / 60) * 60; m <= endMin; m += 60)
      arr.push(m);
    return arr;
  }, [startMin, endMin]);

  const byRow = (staffId: number | null) =>
    reservations.filter((r) => (r.staffId ?? null) === staffId);

  const showNow =
    date === today &&
    nowMin != null &&
    nowMin >= startMin &&
    nowMin <= endMin;
  const nowLeft = showNow ? (nowMin! - startMin) * PX_PER_MIN : 0;

  const noStaff = formData.staffs.length === 0;

  return (
    <>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <DateNav date={date} today={today} />
        <Button size="sm" onClick={() => setModal({ mode: "create" })}>
          ＋ 新規予約
        </Button>
      </div>

      {noStaff && (
        <p className="mb-3 rounded-xl border border-warn/30 bg-warn/10 px-3 py-2 text-xs text-warn">
          この店舗にはスタッフが登録されていません。「設定 →
          スタッフ」から追加すると担当行が表示されます。
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-line bg-surface shadow-panel">
        <div style={{ width: STAFF_W + totalW, minWidth: "100%" }}>
          {/* Header: time axis */}
          <div
            className="sticky top-0 z-30 flex border-b border-line bg-surface"
            style={{ height: HEAD_H }}
          >
            <div
              className="sticky left-0 z-10 flex shrink-0 items-center border-r border-line bg-surface px-3 text-xs font-semibold tracking-wide text-muted"
              style={{ width: STAFF_W }}
            >
              スタッフ
            </div>
            <div className="relative" style={{ width: totalW }}>
              {hours.map((m) => (
                <div
                  key={m}
                  className="absolute top-0 flex h-full items-center text-[11px] text-faint"
                  style={{ left: (m - startMin) * PX_PER_MIN }}
                >
                  <span className="-translate-x-1/2 tabular-nums">
                    {minToTime(m)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Body */}
          <div className="relative">
            {/* current-time cursor */}
            {showNow && (
              <div
                className="pointer-events-none absolute top-0 z-20"
                style={{
                  left: STAFF_W + nowLeft,
                  height: rows.length * ROW_H,
                }}
              >
                <div className="absolute -top-px left-1/2 -translate-x-1/2 rounded-b bg-danger px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
                  {minToTime(nowMin!)}
                </div>
                <div className="h-full w-px bg-danger/80" />
              </div>
            )}

            {rows.map((row) => (
              <div
                key={row.key}
                className="flex border-b border-line/70 last:border-b-0"
                style={{ height: ROW_H }}
              >
                <div
                  className="sticky left-0 z-10 flex shrink-0 items-center gap-2 border-r border-line bg-surface px-3"
                  style={{ width: STAFF_W }}
                >
                  {row.color && (
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-line"
                      style={{ background: row.color }}
                    />
                  )}
                  <span className="truncate text-sm font-medium text-ink">
                    {row.name}
                  </span>
                </div>

                <div
                  className="relative flex-1 cursor-copy"
                  style={{ width: totalW }}
                  onClick={(e) => {
                    const rect = (
                      e.currentTarget as HTMLElement
                    ).getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const raw = startMin + x / PX_PER_MIN;
                    const snapped = Math.round(raw / 15) * 15;
                    setModal({
                      mode: "create",
                      prefill: {
                        staffId: row.staffId ?? undefined,
                        startTime: minToTime(
                          Math.min(Math.max(snapped, startMin), endMin - 15),
                        ),
                      },
                    });
                  }}
                >
                  {hours.map((m) => (
                    <div
                      key={m}
                      className="absolute inset-y-0 border-l border-line/50"
                      style={{ left: (m - startMin) * PX_PER_MIN }}
                    />
                  ))}

                  {byRow(row.staffId).map((r) => {
                    const s = jstMinutes(r.startAt);
                    const e = jstMinutes(r.endAt);
                    const rawLeft = (s - startMin) * PX_PER_MIN;
                    const left = Math.min(
                      Math.max(0, rawLeft),
                      Math.max(0, totalW - 56),
                    );
                    const width = Math.max(
                      56,
                      Math.min(
                        (Math.max(e, s + 15) - s) * PX_PER_MIN,
                        totalW - left,
                      ),
                    );
                    const meta = statusMeta(r.status);
                    const cancelled = [3, 4, 99].includes(r.status);
                    const name =
                      r.customer?.name ?? r.guestName ?? "（名称未設定）";
                    return (
                      <button
                        key={r.id}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          setModal({ mode: "edit", row: r });
                        }}
                        title={`${minToTime(s)}–${minToTime(e)} ${name}`}
                        className={`absolute top-1.5 z-10 flex flex-col overflow-hidden rounded-lg border px-2 py-1 text-left text-[11px] shadow-sm transition-all hover:z-20 hover:border-accent/70 hover:shadow-md ${
                          cancelled
                            ? "border-line bg-elevated/60 opacity-60"
                            : "border-line bg-elevated"
                        }`}
                        style={{
                          left,
                          width,
                          height: ROW_H - 12,
                          borderLeftWidth: 3,
                          borderLeftColor:
                            r.visitSource?.labelTextColor ?? "#d8b06a",
                        }}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-semibold tabular-nums text-ink">
                            {minToTime(s)}
                          </span>
                          <Badge className={meta.className}>
                            {meta.label}
                          </Badge>
                        </div>
                        <div className="truncate font-medium text-ink">
                          {name}
                        </div>
                        {r.menu && (
                          <div className="truncate text-faint">
                            {r.menu.name}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {reservations.length === 0 && (
        <p className="mt-4 text-center text-sm text-faint">
          この日の予約はありません。タイムラインをクリックして追加できます。
        </p>
      )}

      {modal && (
        <AppointmentModal
          key={
            modal.mode === "edit"
              ? `e${modal.row.id}`
              : `c${modal.prefill?.startTime ?? ""}-${modal.prefill?.staffId ?? ""}`
          }
          open
          onClose={() => setModal(null)}
          date={date}
          formData={formData}
          initial={modal.mode === "edit" ? modal.row : null}
          prefill={modal.mode === "create" ? modal.prefill : undefined}
        />
      )}
    </>
  );
}
