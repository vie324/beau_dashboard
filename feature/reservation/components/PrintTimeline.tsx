"use client";

import { useMemo, useState } from "react";
import type { ReservationRow } from "@/feature/reservation/services/getReservations";
import type { ShopHours } from "@/feature/reservation/services/getShopHours";
import { formatJpDate, jstMinutesOfDay } from "@/helper/utils/time";
import { assignLanes } from "@/helper/utils/laneLayout";

type Session = "all" | "morning" | "afternoon";

const SESSION_LABEL: Record<Session, string> = {
  all: "1日",
  morning: "午前",
  afternoon: "午後",
};

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

// 各セルの基本高さ (px)。1 日表示で 12-13 時間が A4 縦に収まる目安。
// 午前/午後のみ表示するときはセル高を動的に拡大して同じくらいの紙面を使う。
const CELL_PX_BASE = 18;
const CELL_PX_MAX = 48;
const TIMELINE_TARGET_PX = 900;
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
  initialSession = "all",
}: {
  date: string;
  reservations: ReservationRow[];
  formData: FormData;
  shopHours: ShopHours;
  shopName: string;
  initialSession?: Session;
}) {
  const [session, setSession] = useState<Session>(initialSession);

  const breakBand = useMemo(() => {
    const bs = parseHm(shopHours.breakStart);
    const be = parseHm(shopHours.breakEnd);
    if (bs == null || be == null || be <= bs) return null;
    return { bs, be };
  }, [shopHours]);

  const hasBreak = breakBand != null;

  const { startMin, endMin } = useMemo(() => {
    let start = parseHm(shopHours.openTime) ?? 9 * 60;
    let end = parseHm(shopHours.closeTime) ?? 21 * 60;
    if (end <= start) {
      start = 9 * 60;
      end = 21 * 60;
    }
    // 午前/午後セッションは break 境界で範囲を絞り、はみ出し予約は許容するが
    // 表示は対象セッション内に限定する。break 未定義のときは全日扱い。
    if (session === "morning" && breakBand) {
      end = breakBand.bs;
    } else if (session === "afternoon" && breakBand) {
      start = breakBand.be;
    } else {
      // all のとき、営業時間外に予約があれば範囲を広げる（表示漏れを防ぐ）。
      for (const r of reservations) {
        const s = jstMinutesOfDay(new Date(r.startAt));
        const e = jstMinutesOfDay(new Date(r.endAt));
        if (s < start) start = Math.floor(s / 60) * 60;
        if (e > end) end = Math.ceil(e / 60) * 60;
      }
    }
    if (end <= start) {
      start = 9 * 60;
      end = 21 * 60;
    }
    return { startMin: start, endMin: end };
  }, [shopHours, reservations, session, breakBand]);

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
      // Resource match
      const resourceOk =
        col.staffId != null
          ? r.staffId === col.staffId
          : col.equipmentId != null
            ? r.staffId == null && r.equipmentId === col.equipmentId
            : false;
      if (!resourceOk) return false;
      // 表示中の時間範囲に少しでも重なるものだけ
      const s = jstMinutesOfDay(new Date(r.startAt));
      const e = jstMinutesOfDay(new Date(r.endAt));
      return e > startMin && s < endMin;
    });

  // セル高さを動的に決定: スロットが少ないとき (午前/午後) はセル高さを拡大して
  // 1日表示と同じくらい紙面を使う。多いとき (1日全体) は基本値のまま。
  const cellPx = useMemo(() => {
    const slots = Math.max(1, timeSlots.length);
    return Math.max(
      CELL_PX_BASE,
      Math.min(CELL_PX_MAX, Math.floor(TIMELINE_TARGET_PX / slots)),
    );
  }, [timeSlots.length]);

  const totalHeight = timeSlots.length * cellPx;

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
            {session !== "all" && (
              <span className="ml-2 rounded bg-accent/15 px-2 py-0.5 text-xs font-medium text-accent">
                {SESSION_LABEL[session]}
              </span>
            )}
            <span className="ml-3 text-sm font-normal text-muted">
              {fmt(startMin)}〜{fmt(endMin)}
            </span>
          </h1>
          {shopName && (
            <p className="text-xs text-muted">{shopName}</p>
          )}
        </div>
        <div className="no-print flex items-center gap-2">
          {hasBreak && (
            <div className="inline-flex rounded-lg border border-line bg-surface p-0.5">
              {(Object.keys(SESSION_LABEL) as Session[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSession(key)}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                    session === key
                      ? "bg-accent text-accent-fg"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  {SESSION_LABEL[key]}
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-lg border border-line bg-accent px-4 py-1.5 text-sm font-medium text-accent-fg hover:bg-accent-hover"
          >
            印刷 / PDF 出力
          </button>
        </div>
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
                  style={{ height: cellPx }}
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
                className="relative overflow-hidden"
                style={{
                  height: totalHeight,
                  background:
                    "repeating-linear-gradient(0deg, transparent 0 17px, rgba(0,0,0,0.04) 17px 18px)",
                }}
              >
                {/* Break overlay (1日のときだけ; 午前/午後は範囲外なので不要) */}
                {breakBand && session === "all" && (
                  <div
                    className="absolute inset-x-0 pointer-events-none"
                    style={{
                      top:
                        ((breakBand.bs - startMin) / MIN_STEP) * cellPx,
                      height:
                        ((breakBand.be - breakBand.bs) / MIN_STEP) * cellPx,
                      background:
                        "repeating-linear-gradient(135deg, rgba(155,144,121,0.18) 0 5px, rgba(155,144,121,0.05) 5px 10px)",
                    }}
                  />
                )}

                {/* Appointments */}
                {(() => {
                const colItems = apptsForColumn(col);
                const laneMap = assignLanes(
                  colItems.map((r) => ({
                    id: r.id,
                    start: jstMinutesOfDay(new Date(r.startAt)),
                    end: Math.max(
                      jstMinutesOfDay(new Date(r.endAt)),
                      jstMinutesOfDay(new Date(r.startAt)) + 15,
                    ),
                  })),
                );
                return colItems.map((r) => {
                  const startTotalMin = jstMinutesOfDay(new Date(r.startAt));
                  const endTotalMin = jstMinutesOfDay(new Date(r.endAt));
                  const top = ((startTotalMin - startMin) / MIN_STEP) * cellPx;
                  const height = Math.max(
                    cellPx - 2,
                    ((endTotalMin - startTotalMin) / MIN_STEP) * cellPx - 2,
                  );
                  const lay = laneMap.get(r.id) ?? { lane: 0, lanes: 1 };
                  const leftStyle = `calc(${(lay.lane / lay.lanes) * 100}% + 2px)`;
                  const widthStyle = `calc(${(1 / lay.lanes) * 100}% - 4px)`;
                  const cancelled = [3, 4, 99].includes(r.status);
                  const isBlock = r.kind === "block";
                  if (isBlock) {
                    return (
                      <div
                        key={r.id}
                        className="absolute overflow-hidden rounded border border-line bg-elevated/70 px-1 py-0.5 text-[9px] text-muted"
                        style={{
                          top,
                          height,
                          left: leftStyle,
                          width: widthStyle,
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
                  // セル高に応じて表示を切り替え（メモ優先）:
                  //   1枠(15分): 1行に時刻+名前(+メモ追記)を集約
                  //   2枠(30分): 時刻/名前/メモ（メニュー名は省略）
                  //   3枠以上 : 時刻/名前/メニュー/メモ
                  const compact = height < cellPx * 1.4;
                  const showMenu = !!menuName && height >= cellPx * 2.4;
                  return (
                    <div
                      key={r.id}
                      className={`absolute overflow-hidden rounded border px-1 py-0.5 text-[9px] leading-tight ${
                        cancelled
                          ? "border-line/40 bg-base/40 text-faint line-through"
                          : "border-ink/30 bg-white text-ink"
                      }`}
                      style={{ top, height, left: leftStyle, width: widthStyle }}
                    >
                      {compact ? (
                        // 15分枠（1行レイアウト）。
                        // 名前とメモは個別に truncate して、長い名前でもメモが完全に消えないようにする。
                        <div className="flex items-center gap-1 overflow-hidden">
                          <span className="shrink-0 font-semibold tabular-nums">
                            {fmt(startTotalMin)}
                          </span>
                          {r.customer?.code && (
                            <span className="shrink-0 text-[8px] text-muted tabular-nums">
                              No.{r.customer.code}
                            </span>
                          )}
                          <span className="min-w-0 truncate font-medium">
                            {name}
                          </span>
                          {r.note && (
                            <span className="min-w-0 truncate text-ink/70">
                              — {r.note}
                            </span>
                          )}
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-semibold tabular-nums">
                              {fmt(startTotalMin)}
                            </span>
                            {r.customer?.code && (
                              <span className="text-[8px] text-muted tabular-nums">
                                No.{r.customer.code}
                              </span>
                            )}
                          </div>
                          <div className="truncate font-medium">{name}</div>
                          {showMenu && (
                            <div className="truncate text-[8px] text-muted">
                              {menuName}
                            </div>
                          )}
                          {r.note && (
                            <div className="line-clamp-2 text-[8px] text-ink/80">
                              {r.note}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                });
                })()}
              </div>
            </div>
          ))}
        </div>
      </div>

      <p className="mt-3 text-right text-[9px] text-faint">
        Powered by Dreamland
      </p>
    </div>
  );
}
