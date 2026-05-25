"use client";

import { Fragment, useMemo, useState } from "react";
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
// 午前/午後のみ表示するときはセル高を動的に拡大して紙面いっぱいに使う。
const CELL_PX_BASE = 18;
const CELL_PX_MAX = 80;
const TIMELINE_TARGET_PX = 1000;
const MIN_STEP = 15;
// 休憩時間帯を縦軸から省略するときに挟む区切りの高さ。
const BREAK_GAP_PX = 18;

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
    // 午前は休憩開始ぴったりで切ると 12:30〜13:00 のような遅めの午前枠が
    // 印刷に出ないので、+1 時間 (休憩終了を上限) まで描画範囲を伸ばす。
    if (session === "morning" && breakBand) {
      end = Math.min(breakBand.be, breakBand.bs + 60);
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

  // 「1日」表示で営業時間内に休憩がある場合は、休憩帯を縦軸から省略して
  // 残りの時間を大きく表示する。午前/午後セッションでは既に範囲が休憩で切られている。
  const skipBreak = session === "all" && breakBand != null;
  const breakDuration = skipBreak ? breakBand!.be - breakBand!.bs : 0;

  const timeSlots = useMemo(() => {
    const arr: number[] = [];
    for (let m = startMin; m < endMin; m += MIN_STEP) {
      if (skipBreak && m >= breakBand!.bs && m < breakBand!.be) continue;
      arr.push(m);
    }
    return arr;
  }, [startMin, endMin, skipBreak, breakBand]);

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

  // セル高さを動的に決定: スロットが少ないとき (午前/午後・休憩省略時) はセル高さを拡大して
  // 1日表示と同じくらい紙面を使う。多いとき (1日全体・休憩なし) は基本値のまま。
  const cellPx = useMemo(() => {
    const slots = Math.max(1, timeSlots.length);
    const available = TIMELINE_TARGET_PX - (skipBreak ? BREAK_GAP_PX : 0);
    return Math.max(
      CELL_PX_BASE,
      Math.min(CELL_PX_MAX, Math.floor(available / slots)),
    );
  }, [timeSlots.length, skipBreak]);

  const totalHeight =
    timeSlots.length * cellPx + (skipBreak ? BREAK_GAP_PX : 0);

  // 絶対時刻(0-1440)→ 縦位置(px)。休憩を省いた分のオフセットと区切り帯を加算する。
  const abs2top = (abs: number): number => {
    if (skipBreak && abs >= breakBand!.be) {
      return (
        ((abs - startMin - breakDuration) / MIN_STEP) * cellPx + BREAK_GAP_PX
      );
    }
    return ((abs - startMin) / MIN_STEP) * cellPx;
  };

  // 休憩区切り帯の上端位置（朝の最後のスロットの直下）。
  const breakGapTop = skipBreak
    ? ((breakBand!.bs - startMin) / MIN_STEP) * cellPx
    : 0;

  return (
    <div className="print-root mx-auto max-w-[210mm] bg-white p-6 text-ink">
      <style>{`
        @page { size: A4 portrait; margin: 10mm; }
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .print-root {
            padding: 0 !important;
            max-width: none !important;
            /* カラーの帯/カードを白黒で読みやすく */
            filter: grayscale(100%);
            /* グリッド線や淡い背景塗りも紙に出るように */
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
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

      <div className="flex border border-ink/50">
        {/* Time column */}
        <div className="w-12 shrink-0 border-r border-ink/40 bg-base/30">
          <div className="h-7 border-b border-ink/40 bg-base text-center text-[10px] font-medium text-ink">
            時刻
          </div>
          <div
            className="relative"
            style={{ height: totalHeight }}
          >
            {timeSlots.map((m) => {
              const onHour = m % 60 === 0;
              const onHalf = m % 30 === 0;
              // 午後の先頭スロットの直前に休憩区切り帯を挟む。
              const insertBreakHere = skipBreak && m === breakBand!.be;
              return (
                <Fragment key={m}>
                  {insertBreakHere && (
                    <div
                      className="flex items-center justify-end border-y border-ink/40 bg-base/60 pr-1 text-[8px] font-medium text-ink/70"
                      style={{ height: BREAK_GAP_PX }}
                    >
                      休憩
                    </div>
                  )}
                  <div
                    className={`flex items-start justify-end pr-1 ${
                      onHour
                        ? "border-t border-ink/60"
                        : onHalf
                          ? "border-t border-ink/30"
                          : "border-t border-ink/15"
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
                </Fragment>
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
              className="flex-1 border-r border-ink/40 last:border-r-0"
            >
              <div className="flex h-7 items-center justify-center border-b border-ink/40 bg-base px-1 text-center">
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
                style={{ height: totalHeight }}
              >
                {/* 背景の横線グリッド。
                    休憩を省く場合は朝/午後を別々に描画して時刻列と線が揃うようにする。 */}
                {(() => {
                  const grid = `repeating-linear-gradient(0deg, transparent 0 ${cellPx - 1}px, rgba(0,0,0,0.18) ${cellPx - 1}px ${cellPx}px)`;
                  if (!skipBreak) {
                    return (
                      <div
                        className="absolute inset-0 pointer-events-none"
                        style={{ background: grid }}
                      />
                    );
                  }
                  return (
                    <>
                      <div
                        className="absolute inset-x-0 pointer-events-none"
                        style={{ top: 0, height: breakGapTop, background: grid }}
                      />
                      <div
                        className="absolute inset-x-0 pointer-events-none"
                        style={{
                          top: breakGapTop + BREAK_GAP_PX,
                          height: totalHeight - breakGapTop - BREAK_GAP_PX,
                          background: grid,
                        }}
                      />
                    </>
                  );
                })()}

                {/* 休憩区切り帯（時刻列の区切りと位置を合わせる） */}
                {skipBreak && (
                  <div
                    className="absolute inset-x-0 border-y border-ink/40 bg-base/40 pointer-events-none"
                    style={{ top: breakGapTop, height: BREAK_GAP_PX }}
                  />
                )}

                {/* Appointments */}
                {(() => {
                const colItems = apptsForColumn(col).filter((r) => {
                  // 休憩省略時に休憩帯ど真ん中の予約は表示しない（通常起きない想定だが防御的に）。
                  if (!skipBreak) return true;
                  const s = jstMinutesOfDay(new Date(r.startAt));
                  const e = jstMinutesOfDay(new Date(r.endAt));
                  return !(s >= breakBand!.bs && e <= breakBand!.be);
                });
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
                  const top = abs2top(startTotalMin);
                  // 休憩を跨ぐ予約は abs2top の差で高さを取ると、休憩帯ぶんを縮めた見た目になる。
                  const height = Math.max(
                    cellPx - 2,
                    abs2top(endTotalMin) - top - 2,
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
                        className="absolute overflow-hidden rounded border border-ink/60 bg-elevated/70 px-1 py-0.5 text-[9px] text-ink"
                        style={{
                          top,
                          height,
                          left: leftStyle,
                          width: widthStyle,
                          background:
                            "repeating-linear-gradient(45deg, rgba(0,0,0,0.18) 0 4px, rgba(0,0,0,0.06) 4px 8px)",
                        }}
                      >
                        <div className="break-words font-medium">
                          {r.blockLabel ?? "時間ブロック"}
                        </div>
                      </div>
                    );
                  }
                  const name =
                    r.customer?.name?.trim() ||
                    r.guestName?.trim() ||
                    "（名称未設定）";
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
                          ? "border-ink/40 bg-elevated text-faint line-through"
                          : "border-ink/70 bg-[#dfd9c8] text-ink"
                      }`}
                      style={{ top, height, left: leftStyle, width: widthStyle }}
                    >
                      {compact ? (
                        // 15分枠。1行目に時刻+No、2行目以降に名前(+メモ)。
                        // 時刻+Noと名前を同じ flex 行に並べると、ダブルブッキングで
                        // レーンが半分の幅になったとき名前が描画スペースを失って消えるため、
                        // 名前は必ず独立した行で全幅で描画する。
                        <div className="flex flex-col overflow-hidden leading-tight">
                          <div className="flex items-center gap-1 overflow-hidden">
                            <span className="shrink-0 font-semibold tabular-nums">
                              {fmt(startTotalMin)}
                            </span>
                            {r.customer?.code && (
                              <span className="shrink-0 text-[8px] text-muted tabular-nums">
                                No.{r.customer.code}
                              </span>
                            )}
                          </div>
                          <div className="break-words font-medium">{name}</div>
                          {r.note && (
                            <div className="break-words text-[8px] text-ink/70">
                              {r.note}
                            </div>
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
                          <div className="break-words font-medium">{name}</div>
                          {showMenu && (
                            <div className="break-words text-[8px] text-muted">
                              {menuName}
                            </div>
                          )}
                          {r.note && (
                            <div className="break-words text-[8px] text-ink/80">
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
