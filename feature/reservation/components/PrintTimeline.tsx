"use client";

import { useMemo } from "react";
import type { ReservationRow } from "@/feature/reservation/services/getReservations";
import type { ShopHours } from "@/feature/reservation/services/getShopHours";
import { formatJpDate, jstMinutesOfDay } from "@/helper/utils/time";

type FormData = {
  staffs: { id: number; name: string; color?: string }[];
  equipments: { id: number; name: string; color?: string }[];
  menus: unknown[];
  customers: unknown[];
  visitSources: unknown[];
};

type Column = {
  key: string;
  staffId: number | null;
  equipmentId: number | null;
  name: string;
  color: string | undefined;
};

// 15分刻みの各セル高さ (px)。A4 縦 1 枚に営業時間（最大 12-13 時間）が収まる目安。
const CELL_PX = 18;
const MIN_STEP = 15;

function parseHm(s: string | null | undefined): number | null {
  if (!s) return null;
  const [h, m] = s.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

function fmt(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(
    min % 60,
  ).padStart(2, "0")}`;
}

export function PrintTimeline({
  date,
  reservations,
  formData,
  shopHours,
  shopName,
}: {
  date: string;
  reservations: ReservationRow[];
  formData: FormData;
  shopHours: ShopHours;
  shopName: string;
}) {
  const { startMin, endMin } = useMemo(() => {
    let start = parseHm(shopHours.openTime) ?? 9 * 60;
    let end = parseHm(shopHours.closeTime) ?? 21 * 60;
    if (end <= start) {
      start = 9 * 60;
      end = 21 * 60;
    }
    // 営業時間外に予約があれば範囲を広げる（表示漏れを防ぐ）
    for (const r of reservations) {
      const s = jstMinutesOfDay(new Date(r.startAt));
      const e = jstMinutesOfDay(new Date(r.endAt));
      if (s < start) start = Math.floor(s / 60) * 60;
      if (e > end) end = Math.ceil(e / 60) * 60;
    }
    return { startMin: start, endMin: end };
  }, [shopHours, reservations]);

  const breakBand = useMemo(() => {
    const bs = parseHm(shopHours.breakStart);
    const be = parseHm(shopHours.breakEnd);
    if (bs == null || be == null || be <= bs) return null;
    return { bs, be };
  }, [shopHours]);

  const timeSlots = useMemo(() => {
    const arr: number[] = [];
    for (let m = startMin; m < endMin; m += MIN_STEP) arr.push(m);
    return arr;
  }, [startMin, endMin]);

  const columns: Column[] = useMemo(() => {
    const cols: Column[] = formData.staffs.map((s) => ({
      key: `staff-${s.id}`,
      staffId: s.id,
      equipmentId: null,
      name: s.name,
      color: s.color,
    }));
    for (const eq of formData.equipments) {
      cols.push({
        key: `equip-${eq.id}`,
        staffId: null,
        equipmentId: eq.id,
        name: eq.name,
        color: eq.color,
      });
    }
    return cols;
  }, [formData.staffs, formData.equipments]);

  const apptsForColumn = (col: Column) =>
    reservations.filter((r) => {
      if (col.staffId != null) return r.staffId === col.staffId;
      if (col.equipmentId != null)
        return r.staffId == null && r.equipmentId === col.equipmentId;
      return false;
    });

  const totalHeight = timeSlots.length * CELL_PX;

  return (
    <div className="print-root mx-auto max-w-[210mm] bg-white p-6 text-ink">
      <style>{`
        @page { size: A4 portrait; margin: 10mm; }
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .print-root { padding: 0 !important; max-width: none !important; }
        }
      `}</style>

      <div className="mb-3 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold tracking-wide">
            {formatJpDate(date)} の予約
            <span className="ml-3 text-sm font-normal text-muted">
              {fmt(startMin)}〜{fmt(endMin)}
            </span>
          </h1>
          {shopName && (
            <p className="text-xs text-muted">{shopName}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="no-print rounded-lg border border-line bg-accent px-4 py-1.5 text-sm font-medium text-accent-fg hover:bg-accent-hover"
        >
          印刷 / PDF 出力
        </button>
      </div>

      <div className="flex border border-line">
        {/* Time column */}
        <div className="w-12 shrink-0 border-r border-line bg-base/30">
          <div className="h-7 border-b border-line bg-base text-center text-[10px] font-medium text-muted">
            時刻
          </div>
          <div
            className="relative"
            style={{ height: totalHeight }}
          >
            {timeSlots.map((m) => {
              const onHour = m % 60 === 0;
              const onHalf = m % 30 === 0;
              return (
                <div
                  key={m}
                  className={`flex items-start justify-end pr-1 ${
                    onHour
                      ? "border-t border-line/80"
                      : onHalf
                        ? "border-t border-line/40"
                        : "border-t border-line/20"
                  }`}
                  style={{ height: CELL_PX }}
                >
                  <span
                    className={`text-[9px] tabular-nums ${
                      onHour
                        ? "font-semibold text-ink"
                        : onHalf
                          ? "text-muted"
                          : "text-faint"
                    }`}
                  >
                    {fmt(m)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Resource columns */}
        <div className="flex flex-1">
          {columns.length === 0 && (
            <div className="flex flex-1 items-center justify-center py-8 text-xs text-faint">
              スタッフ・設備が未登録です
            </div>
          )}
          {columns.map((col) => (
            <div
              key={col.key}
              className="flex-1 border-r border-line last:border-r-0"
            >
              <div className="flex h-7 items-center justify-center border-b border-line bg-base px-1 text-center">
                <span className="flex items-center gap-1 text-[10px] font-medium text-ink">
                  {col.color && (
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ background: col.color }}
                    />
                  )}
                  <span className="truncate">{col.name}</span>
                </span>
              </div>

              <div
                className="relative"
                style={{
                  height: totalHeight,
                  background:
                    "repeating-linear-gradient(0deg, transparent 0 17px, rgba(0,0,0,0.04) 17px 18px)",
                }}
              >
                {/* Break overlay */}
                {breakBand && (
                  <div
                    className="absolute inset-x-0 pointer-events-none"
                    style={{
                      top:
                        ((breakBand.bs - startMin) / MIN_STEP) * CELL_PX,
                      height:
                        ((breakBand.be - breakBand.bs) / MIN_STEP) * CELL_PX,
                      background:
                        "repeating-linear-gradient(135deg, rgba(155,144,121,0.18) 0 5px, rgba(155,144,121,0.05) 5px 10px)",
                    }}
                  />
                )}

                {/* Appointments */}
                {apptsForColumn(col).map((r) => {
                  const startTotalMin = jstMinutesOfDay(new Date(r.startAt));
                  const endTotalMin = jstMinutesOfDay(new Date(r.endAt));
                  const top = ((startTotalMin - startMin) / MIN_STEP) * CELL_PX;
                  const height = Math.max(
                    CELL_PX - 2,
                    ((endTotalMin - startTotalMin) / MIN_STEP) * CELL_PX - 2,
                  );
                  const cancelled = [3, 4, 99].includes(r.status);
                  const isBlock = r.kind === "block";
                  if (isBlock) {
                    return (
                      <div
                        key={r.id}
                        className="absolute inset-x-0.5 overflow-hidden rounded border border-line bg-elevated/70 px-1 py-0.5 text-[9px] text-muted"
                        style={{
                          top,
                          height,
                          background:
                            "repeating-linear-gradient(45deg, rgba(155,144,121,0.25) 0 4px, rgba(155,144,121,0.08) 4px 8px)",
                        }}
                      >
                        <div className="truncate font-medium">
                          {r.blockLabel ?? "時間ブロック"}
                        </div>
                      </div>
                    );
                  }
                  const name =
                    r.customer?.name ?? r.guestName ?? "（名称未設定）";
                  const menuName = r.menu?.name ?? "";
                  return (
                    <div
                      key={r.id}
                      className={`absolute inset-x-0.5 overflow-hidden rounded border px-1 py-0.5 text-[9px] leading-tight ${
                        cancelled
                          ? "border-line/40 bg-base/40 text-faint line-through"
                          : "border-ink/30 bg-white text-ink"
                      }`}
                      style={{ top, height }}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-semibold tabular-nums">
                          {fmt(startTotalMin)}
                        </span>
                        {r.customer?.id != null && (
                          <span className="text-[8px] text-muted tabular-nums">
                            #{r.customer.id}
                          </span>
                        )}
                      </div>
                      <div className="truncate font-medium">{name}</div>
                      {menuName && height > CELL_PX * 1.5 && (
                        <div className="truncate text-[8px] text-muted">
                          {menuName}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <p className="mt-3 text-right text-[9px] text-faint">
        Powered by Beau
      </p>
    </div>
  );
}
