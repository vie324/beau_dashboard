"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { statusMeta } from "@/helper/utils/status";
import { DateNav } from "@/feature/reservation/components/DateNav";
import { AppointmentModal } from "@/feature/reservation/components/AppointmentModal";
import type { ReservationRow } from "@/feature/reservation/services/getReservations";

const BASE_START = 9 * 60; // 09:00 (default visible window)
const BASE_END = 21 * 60; // 21:00
const PX_PER_MIN = 1.1;

function jstMinutes(d: Date): number {
  const t = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(d));
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
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

  const columns = useMemo(() => {
    const cols = formData.staffs.map((s) => ({
      key: `staff-${s.id}`,
      staffId: s.id as number | null,
      name: s.name,
    }));
    const hasUnassigned = reservations.some((r) => r.staffId == null);
    if (hasUnassigned || cols.length === 0) {
      cols.push({ key: "unassigned", staffId: null, name: "指名なし" });
    }
    return cols;
  }, [formData.staffs, reservations]);

  // Expand the visible window so reservations before 09:00 / after 21:00
  // are never hidden or unclickable.
  const { startMin, endMin } = useMemo(() => {
    let start = BASE_START;
    let end = BASE_END;
    for (const r of reservations) {
      const s = jstMinutes(r.startAt);
      const e = jstMinutes(r.endAt);
      if (s < start) start = Math.floor(s / 60) * 60;
      if (e > end) end = Math.ceil(e / 60) * 60;
    }
    return {
      startMin: Math.max(0, start),
      endMin: Math.min(24 * 60, end),
    };
  }, [reservations]);
  const totalPx = (endMin - startMin) * PX_PER_MIN;

  const hours = useMemo(() => {
    const arr: number[] = [];
    for (let m = startMin; m <= endMin; m += 60) arr.push(m);
    return arr;
  }, [startMin, endMin]);

  const byColumn = (staffId: number | null) =>
    reservations.filter((r) => (r.staffId ?? null) === staffId);

  return (
    <>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <DateNav date={date} today={today} />
        <Button size="sm" onClick={() => setModal({ mode: "create" })}>
          ＋ 新規予約
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-line bg-surface shadow-panel">
        <div className="flex min-w-[640px]">
          {/* Time gutter */}
          <div className="w-14 shrink-0 border-r border-line">
            <div className="h-10 border-b border-line" />
            <div className="relative" style={{ height: totalPx }}>
              {hours.map((m) => (
                <div
                  key={m}
                  className="absolute right-2 -translate-y-1/2 text-[11px] text-faint"
                  style={{ top: (m - startMin) * PX_PER_MIN }}
                >
                  {minToTime(m)}
                </div>
              ))}
            </div>
          </div>

          {/* Staff columns */}
          <div className="flex flex-1">
            {columns.map((col) => (
              <div
                key={col.key}
                className="min-w-[150px] flex-1 border-r border-line last:border-r-0"
              >
                <div className="flex h-10 items-center justify-center border-b border-line text-xs font-medium text-muted">
                  {col.name}
                </div>
                <div
                  className="relative"
                  style={{ height: totalPx }}
                  onClick={(e) => {
                    const rect = (
                      e.currentTarget as HTMLElement
                    ).getBoundingClientRect();
                    const y = e.clientY - rect.top;
                    const raw = startMin + y / PX_PER_MIN;
                    const snapped = Math.round(raw / 15) * 15;
                    setModal({
                      mode: "create",
                      prefill: {
                        staffId: col.staffId ?? undefined,
                        startTime: minToTime(
                          Math.min(Math.max(snapped, startMin), endMin - 15),
                        ),
                      },
                    });
                  }}
                >
                  {/* hour grid lines */}
                  {hours.map((m) => (
                    <div
                      key={m}
                      className="absolute inset-x-0 border-t border-line/60"
                      style={{ top: (m - startMin) * PX_PER_MIN }}
                    />
                  ))}

                  {byColumn(col.staffId).map((r) => {
                    const s = jstMinutes(r.startAt);
                    const e = jstMinutes(r.endAt);
                    const rawTop = (s - startMin) * PX_PER_MIN;
                    const top = Math.min(
                      Math.max(0, rawTop),
                      Math.max(0, totalPx - 24),
                    );
                    const rawHeight =
                      (Math.max(e, s + 15) - s) * PX_PER_MIN;
                    const height = Math.max(
                      24,
                      Math.min(rawHeight, totalPx - top),
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
                        className={`absolute inset-x-1 overflow-hidden rounded-lg border px-2 py-1 text-left text-[11px] transition-colors hover:border-accent/60 ${
                          cancelled
                            ? "border-line bg-elevated/60 opacity-60"
                            : "border-line bg-elevated hover:bg-elevated"
                        }`}
                        style={{ top, height }}
                      >
                        <div
                          className="absolute inset-y-0 left-0 w-1"
                          style={{
                            background:
                              r.visitSource?.labelTextColor ?? "#d8b06a",
                          }}
                        />
                        <div className="flex items-center justify-between gap-1 pl-1">
                          <span className="font-medium text-ink">
                            {minToTime(s)}
                          </span>
                          <Badge className={meta.className}>{meta.label}</Badge>
                        </div>
                        <div className="truncate pl-1 text-ink">{name}</div>
                        {r.menu && (
                          <div className="truncate pl-1 text-faint">
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
