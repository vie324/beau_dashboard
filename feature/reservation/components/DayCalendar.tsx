"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { statusMeta } from "@/helper/utils/status";
import { jstMinutesOfDay } from "@/helper/utils/time";
import { assignLanes } from "@/helper/utils/laneLayout";
import type { ReservationRow } from "@/feature/reservation/services/getReservations";

const PX_PER_MIN = 2; // 縦軸の高さ（1分=2px → 1時間=120px / 15分=30px）
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
 * - カードをドラッグ&ドロップで時刻/担当を変更（離した位置で onCardDrop 通知）
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
  onCardDrop,
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
    target: { staffId: number | null; equipmentId: number | null },
    startTime: string,
    durationMin: number,
  ) => void;
  onCardDrop?: (
    row: ReservationRow,
    newStartMin: number,
    col: Col,
  ) => void;
}) {
  const totalH = (endMin - startMin) * PX_PER_MIN;

  const hours: number[] = [];
  for (let m = Math.ceil(startMin / 60) * 60; m <= endMin; m += 60) hours.push(m);

  // 15分ごとの目盛り（正時は hours 側で描くので :15 :30 :45 のみ）。
  const quarters: number[] = [];
  for (let m = Math.ceil(startMin / 15) * 15; m <= endMin; m += 15) {
    if (m % 60 !== 0) quarters.push(m);
  }

  const showNow =
    date === today && nowMin != null && nowMin >= startMin && nowMin <= endMin;

  // 縦ドラッグで時間ブロックを作成（PCのみ）。横タイムラインと同じ操作感。
  // スタッフ列ならスタッフブロック、設備列なら設備ブロックを作成する。
  const dragRef = useRef<{
    startClientY: number;
    colEl: HTMLElement;
    staffId: number | null;
    equipmentId: number | null;
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

  // 既存カードをドラッグして時刻・担当を変更するためのフック。
  // マウス: 即時ドラッグ (5px 以上動いたら開始)
  // タッチ: 350ms 長押しで「持ち上げ」→ ドラッグ。長押し前に動いたらキャンセル
  //         (スクロールを優先したいため)。カードには touch-action: none を当てている
  //         ので、長押し成立後はブラウザにスクロールを奪われない。
  const columnRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const cardDragRef = useRef<{
    row: ReservationRow;
    startClientX: number;
    startClientY: number;
    moved: boolean;
  } | null>(null);
  const [cardDragPreview, setCardDragPreview] = useState<{
    row: ReservationRow;
    newStartMin: number;
    newColKey: string;
  } | null>(null);
  const cardSuppressClickRef = useRef(false);

  const getColAtClientX = (clientX: number): Col | null => {
    for (const c of cols) {
      const el = columnRefs.current[c.key];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (clientX >= r.left && clientX <= r.right) return c;
    }
    return null;
  };

  const onCardPointerDown =
    (row: ReservationRow) => (e: React.PointerEvent<HTMLButtonElement>) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      // 列の onPointerDown (空き部分のドラッグ作成) を発火させない
      e.stopPropagation();
      if (!onCardDrop) return;

      const isTouch = e.pointerType === "touch";
      const cardEl = e.currentTarget;
      const pointerId = e.pointerId;

      let started = !isTouch; // マウス/ペンは即時ドラッグ開始可能 / タッチは長押し待ち
      let cancelled = false;
      let timerId: number | null = null;

      cardDragRef.current = {
        row,
        startClientX: e.clientX,
        startClientY: e.clientY,
        moved: false,
      };

      const lift = () => {
        if (cancelled) return;
        started = true;
        cardEl.style.transition = "transform 100ms ease-out";
        cardEl.style.transform = "scale(1.04)";
        cardEl.style.zIndex = "40";
        if (
          isTouch &&
          typeof navigator !== "undefined" &&
          "vibrate" in navigator
        ) {
          try {
            navigator.vibrate(15);
          } catch {
            // 振動非対応端末は無視
          }
        }
      };

      if (isTouch) {
        timerId = window.setTimeout(lift, 350);
      }

      const compute = (clientX: number, clientY: number) => {
        const targetCol = getColAtClientX(clientX);
        if (!targetCol) return null;
        const targetEl = columnRefs.current[targetCol.key];
        if (!targetEl) return null;
        const colRect = targetEl.getBoundingClientRect();
        const y = clientY - colRect.top;
        const rawT = startMin + y / PX_PER_MIN;
        const snappedT = Math.max(
          startMin,
          Math.min(endMin - 15, Math.round(rawT / 15) * 15),
        );
        return { col: targetCol, newStartMin: snappedT };
      };

      const cleanup = () => {
        if (timerId != null) {
          window.clearTimeout(timerId);
          timerId = null;
        }
        cardEl.style.transition = "";
        cardEl.style.transform = "";
        cardEl.style.zIndex = "";
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.removeEventListener("pointercancel", onUp);
      };

      const onMove = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        const d = cardDragRef.current;
        if (!d) return;
        const dx = ev.clientX - d.startClientX;
        const dy = ev.clientY - d.startClientY;
        const dist = Math.hypot(dx, dy);

        if (!started) {
          // タッチで長押し成立前に動いた → スクロール優先でキャンセル
          if (dist > 8) {
            cancelled = true;
            cardDragRef.current = null;
            cleanup();
          }
          return;
        }

        if (!d.moved && dist < 5) return;
        d.moved = true;
        const next = compute(ev.clientX, ev.clientY);
        if (!next) return;
        setCardDragPreview({
          row: d.row,
          newStartMin: next.newStartMin,
          newColKey: next.col.key,
        });
      };

      const onUp = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        const d = cardDragRef.current;
        cardDragRef.current = null;
        setCardDragPreview(null);
        cleanup();
        if (!d || !started || !d.moved) return;
        // ドラッグ直後に発火しうるクリックを全部抑制する
        cardSuppressClickRef.current = true;
        suppressClickRef.current = true;
        setTimeout(() => {
          cardSuppressClickRef.current = false;
          suppressClickRef.current = false;
        }, 100);
        const next = compute(ev.clientX, ev.clientY);
        if (!next) return;
        onCardDrop(d.row, next.newStartMin, next.col);
      };

      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
      document.addEventListener("pointercancel", onUp);
    };

  const byCol = (c: Col) =>
    reservations.filter((r) => {
      if (c.staffId != null) return r.staffId === c.staffId;
      if (c.equipmentId != null)
        return r.staffId == null && r.equipmentId === c.equipmentId;
      return r.staffId == null && r.equipmentId == null;
    });

  return (
    <div
      className="overflow-auto rounded-xl border border-line bg-surface shadow-panel"
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
                className="absolute right-1 -translate-y-1/2 text-[11px] font-medium tabular-nums text-faint"
                style={{ top: (m - startMin) * PX_PER_MIN }}
              >
                {minToTime(m)}
              </div>
            ))}
            {quarters.map((m) => (
              <div
                key={`q${m}`}
                className="absolute right-1 -translate-y-1/2 text-[10px] tabular-nums text-faint opacity-60"
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
                ref={(el) => {
                  columnRefs.current[col.key] = el;
                }}
                className="relative flex-1 cursor-copy border-r border-line last:border-r-0"
                style={{ minWidth: MIN_COL_W, height: totalH }}
                onPointerDown={(e) => {
                  // 空き部分のドラッグ作成はマウスのみ。タッチではタップで新規予約モーダル、
                  // ＋ FAB / 時間ブロックボタンを使う前提とする。
                  if (e.pointerType !== "mouse") return;
                  if (e.button !== 0) return;
                  // 「指名なし」列 (staffId/equipmentId 共に null) のみドラッグ作成不可。
                  // スタッフ列・設備列はそれぞれの種類のブロックを作成できる。
                  if (col.staffId == null && col.equipmentId == null) return;
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
                    equipmentId: col.equipmentId,
                    colKey: col.key,
                    a,
                    b: a,
                    moved: false,
                  };
                  const onMove = (ev: PointerEvent) => {
                    if (ev.pointerType !== "mouse") return;
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
                  const onUp = (ev: PointerEvent) => {
                    if (ev.pointerType !== "mouse") return;
                    document.removeEventListener("pointermove", onMove);
                    document.removeEventListener("pointerup", onUp);
                    const d = dragRef.current;
                    dragRef.current = null;
                    if (!d) return;
                    if (d.moved) {
                      const lo = Math.min(d.a, d.b);
                      const hi = Math.max(d.a, d.b);
                      const duration = Math.max(15, hi - lo);
                      suppressClickRef.current = true;
                      onDragCreate(
                        {
                          staffId: d.staffId,
                          equipmentId: d.equipmentId,
                        },
                        minToTime(lo),
                        duration,
                      );
                    }
                    setDragSel(null);
                  };
                  document.addEventListener("pointermove", onMove);
                  document.addEventListener("pointerup", onUp);
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
                {/* Quarter-hour gridlines（15分の薄い線） */}
                {quarters.map((m) => (
                  <div
                    key={`q${m}`}
                    className="pointer-events-none absolute inset-x-0 border-t border-line/20"
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

                {/* Card drag-to-move ghost (移動先プレビュー) */}
                {cardDragPreview &&
                  cardDragPreview.newColKey === col.key &&
                  (() => {
                    const durMin = Math.max(
                      15,
                      jstMinutes(cardDragPreview.row.endAt) -
                        jstMinutes(cardDragPreview.row.startAt),
                    );
                    return (
                      <div
                        className="pointer-events-none absolute inset-x-1 z-30 rounded-md border-2 border-accent bg-accent/25 shadow-md"
                        style={{
                          top:
                            (cardDragPreview.newStartMin - startMin) *
                            PX_PER_MIN,
                          height: durMin * PX_PER_MIN - 2,
                        }}
                      >
                        <span className="m-1 inline-block rounded bg-accent px-1 py-0.5 text-[10px] font-semibold leading-none text-accent-fg tabular-nums">
                          {minToTime(cardDragPreview.newStartMin)}–
                          {minToTime(cardDragPreview.newStartMin + durMin)}
                        </span>
                      </div>
                    );
                  })()}

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

                  const beingDragged = cardDragPreview?.row.id === r.id;
                  if (r.kind === "block") {
                    const label = r.blockLabel ?? "時間ブロック";
                    return (
                      <button
                        key={r.id}
                        onPointerDown={onCardPointerDown(r)}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          if (cardSuppressClickRef.current) {
                            cardSuppressClickRef.current = false;
                            return;
                          }
                          onCardClick(r);
                        }}
                        title={`${minToTime(s)}–${minToTime(e)} ${label}`}
                        className={`absolute z-10 overflow-hidden rounded-md border border-line px-1.5 py-0.5 text-left text-[10px] text-muted transition-colors hover:z-20 hover:border-accent/70 ${
                          onCardDrop ? "cursor-grab active:cursor-grabbing" : ""
                        } ${beingDragged ? "opacity-40" : ""}`}
                        style={{
                          top,
                          height,
                          left: leftStyle,
                          width: widthStyle,
                          touchAction: onCardDrop ? "none" : undefined,
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
                      onPointerDown={onCardPointerDown(r)}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        if (cardSuppressClickRef.current) {
                          cardSuppressClickRef.current = false;
                          return;
                        }
                        onCardClick(r);
                      }}
                      title={`${minToTime(s)}–${minToTime(e)} ${name}${r.note ? `\n${r.note}` : ""}`}
                      className={`absolute z-10 overflow-hidden rounded-md border px-1.5 py-0.5 text-left text-[10px] shadow-sm transition-colors hover:z-20 hover:border-accent/70 ${
                        cancelled
                          ? "border-line bg-elevated/60 opacity-60"
                          : "border-line bg-elevated"
                      } ${!r.confirmed && !cancelled ? "ring-1 ring-warn" : ""} ${
                        onCardDrop ? "cursor-grab active:cursor-grabbing" : ""
                      } ${beingDragged ? "opacity-40" : ""}`}
                      style={{
                        top,
                        height,
                        left: leftStyle,
                        width: widthStyle,
                        touchAction: onCardDrop ? "none" : undefined,
                        background: r.cardColor || undefined,
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
                          {/* メモ優先。メニュー名はさらに余裕があるときだけ。 */}
                          {r.note && height > 44 && (
                            <div className="line-clamp-2 whitespace-pre-wrap break-words text-ink/80">
                              {r.note}
                            </div>
                          )}
                          {r.menu && height > (r.note ? 84 : 48) && (
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
