"use client";

import { useEffect, useMemo, useOptimistic, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { statusMeta } from "@/helper/utils/status";
import { jstMinutesOfDay } from "@/helper/utils/time";
import { staffWorksOn } from "@/helper/utils/staffWork";
import { assignLanes } from "@/helper/utils/laneLayout";
import { DateNav } from "@/feature/reservation/components/DateNav";
import { CustomerCodeSearch } from "@/feature/reservation/components/CustomerCodeSearch";
import { AppointmentModal } from "@/feature/reservation/components/AppointmentModal";
import { TimeBlockModal } from "@/feature/reservation/components/TimeBlockModal";
import { DayCalendar } from "@/feature/reservation/components/DayCalendar";
import {
  MoveConfirmModal,
  type MoveTarget,
} from "@/feature/reservation/components/MoveConfirmModal";
import type { ReservationRow } from "@/feature/reservation/services/getReservations";
import type { ShopHours } from "@/feature/reservation/services/getShopHours";
import type { ReservationOptimisticAction } from "@/feature/reservation/types/optimistic";

const BASE_START = 9 * 60; // 09:00 default window
const BASE_END = 21 * 60; // 21:00
const PX_PER_MIN = 2.0;
const ROW_H = 88; // px per staff row
const STAFF_W = 152; // px sticky staff-name column
const HEAD_H = 40;

function jstMinutes(d: Date): number {
  return jstMinutesOfDay(new Date(d));
}

function parseHm(t?: string | null): number | null {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  if (!Number.isInteger(h) || !Number.isInteger(m)) return null;
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
  reservations: reservationsProp,
  formData,
  shopHours,
}: {
  date: string;
  today: string;
  reservations: ReservationRow[];
  formData: FormData;
  shopHours?: ShopHours;
}) {
  // 楽観的更新: 保存/削除した瞬間にカレンダー側で先行反映。
  // サーバーが revalidatePath を呼んだ後、props が新しいデータに切り替わったら
  // useOptimistic が自動でそれに同期する。
  const [reservations, applyOptimistic] = useOptimistic<
    ReservationRow[],
    ReservationOptimisticAction
  >(reservationsProp, (state, action) => {
    const byStart = (a: ReservationRow, b: ReservationRow) =>
      new Date(a.startAt).getTime() - new Date(b.startAt).getTime();
    switch (action.type) {
      case "add":
        return [...state.filter((r) => r.id !== action.row.id), action.row].sort(
          byStart,
        );
      case "addMany": {
        const newIds = new Set(action.rows.map((r) => r.id));
        return [...state.filter((r) => !newIds.has(r.id)), ...action.rows].sort(
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
        prefill?: { staffId?: number; startTime?: string };
      }
    | { kind: "appointment"; mode: "edit"; row: ReservationRow }
    | {
        kind: "block";
        mode: "create";
        prefill?: {
          staffId?: number;
          equipmentId?: number;
          startTime?: string;
          durationMin?: number;
        };
      }
    | { kind: "block"; mode: "edit"; row: ReservationRow };
  const [modal, setModal] = useState<ModalState | null>(null);
  // 予約カードのドラッグ&ドロップ後に表示する移動確認モーダルの対象。
  const [moveTarget, setMoveTarget] = useState<MoveTarget | null>(null);

  const openCardEdit = (r: ReservationRow) =>
    setModal(
      r.kind === "block"
        ? { kind: "block", mode: "edit", row: r }
        : { kind: "appointment", mode: "edit", row: r },
    );

  // 患者番号検索などで `?focus=<予約ID>` 付きで遷移してきた場合、
  // その予約のモーダルを自動で開く。読み込んだら URL から focus を消す。
  const router = useRouter();
  const searchParams = useSearchParams();
  const focusParam = searchParams.get("focus");
  useEffect(() => {
    if (!focusParam) return;
    const id = Number(focusParam);
    if (!Number.isFinite(id)) return;
    const target = reservations.find((r) => r.id === id);
    if (target) {
      openCardEdit(target);
      const next = new URLSearchParams(searchParams.toString());
      next.delete("focus");
      const qs = next.toString();
      router.replace(`/reservation${qs ? `?${qs}` : ""}`, { scroll: false });
    }
  }, [focusParam, reservations, router, searchParams]);

  // ドラッグで時間ブロックを作成する（PCのみ。スマホは「＋ 時間ブロック」ボタンを使用）。
  // スタッフ行ならスタッフブロック、設備行なら設備ブロックを作る。
  const dragRef = useRef<{
    startClientX: number;
    laneEl: HTMLElement;
    staffId: number | null;
    equipmentId: number | null;
    rowKey: string;
    a: number; // 起点分（スナップ済み）
    b: number; // 現在分（スナップ済み）
    moved: boolean;
  } | null>(null);
  const [dragSel, setDragSel] = useState<{
    rowKey: string;
    startMin: number;
    endMin: number;
  } | null>(null);
  const suppressClickRef = useRef(false);

  // Live "now" in minutes (JST), refreshed every 30s — drives the time cursor.
  const [nowMin, setNowMin] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNowMin(jstMinutesOfDay(new Date()));
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);

  // 表示モードは PC とスマホで独立。
  //   PC:   timeline (横軸=時間) / day (縦軸=時間, Googleカレンダー風)
  //   スマホ: list (時刻順カードリスト) / day (縦タイムライン)
  // それぞれ localStorage に保存して次回も維持。
  const [desktopView, setDesktopView] = useState<"timeline" | "day">(
    "timeline",
  );
  const [mobileView, setMobileView] = useState<"list" | "day">("list");
  useEffect(() => {
    // 旧キー(beau_reservation_view) は PC の好みとしてフォールバック移行する。
    const legacy = localStorage.getItem("beau_reservation_view");
    const d = localStorage.getItem("beau_reservation_view_desktop") ?? legacy;
    if (d === "day" || d === "timeline") setDesktopView(d);
    const m = localStorage.getItem("beau_reservation_view_mobile");
    if (m === "day" || m === "list") setMobileView(m);
  }, []);
  const toggleDesktopView = () =>
    setDesktopView((m) => {
      const next = m === "timeline" ? "day" : "timeline";
      try {
        localStorage.setItem("beau_reservation_view_desktop", next);
      } catch {
        // localStorage 不可の環境では保存しない（表示自体は機能する）
      }
      return next;
    });
  const toggleMobileView = () =>
    setMobileView((m) => {
      const next = m === "list" ? "day" : "list";
      try {
        localStorage.setItem("beau_reservation_view_mobile", next);
      } catch {
        // localStorage 不可の環境では保存しない（表示自体は機能する）
      }
      return next;
    });

  const rows = useMemo(() => {
    // 臨時スタッフは「出勤日」または「その日に既存予約がある日」だけ列を出す。
    const visibleStaffs = formData.staffs.filter((s) => {
      if (!staffWorksOn(s, date)) {
        const hasAppt = reservations.some((x) => x.staffId === s.id);
        if (!hasAppt) return false;
      }
      return true;
    });
    const r: {
      key: string;
      staffId: number | null;
      equipmentId: number | null;
      name: string;
      color: string | undefined;
    }[] = visibleStaffs.map((s) => ({
      key: `staff-${s.id}`,
      staffId: s.id,
      equipmentId: null,
      name: s.name,
      color: s.color as string | undefined,
    }));
    for (const eq of formData.equipments ?? []) {
      r.push({
        key: `equip-${eq.id}`,
        staffId: null,
        equipmentId: eq.id,
        name: eq.name,
        color: eq.color as string | undefined,
      });
    }
    const hasUnassigned = reservations.some(
      (x) => x.staffId == null && x.equipmentId == null,
    );
    if (hasUnassigned || r.length === 0) {
      r.push({
        key: "unassigned",
        staffId: null,
        equipmentId: null,
        name: "指名なし",
        color: undefined,
      });
    }
    return r;
  }, [formData.staffs, formData.equipments, reservations, date]);

  const { startMin, endMin } = useMemo(() => {
    let start = parseHm(shopHours?.openTime) ?? BASE_START;
    let end = parseHm(shopHours?.closeTime) ?? BASE_END;
    if (end <= start) {
      start = BASE_START;
      end = BASE_END;
    }
    for (const r of reservations) {
      const s = jstMinutes(r.startAt);
      const e = jstMinutes(r.endAt);
      if (s < start) start = Math.floor(s / 60) * 60;
      if (e > end) end = Math.ceil(e / 60) * 60;
    }
    return { startMin: Math.max(0, start), endMin: Math.min(24 * 60, end) };
  }, [reservations, shopHours]);

  const breakBand = useMemo(() => {
    const bs = parseHm(shopHours?.breakStart);
    const be = parseHm(shopHours?.breakEnd);
    if (bs == null || be == null || be <= bs) return null;
    return { bs, be };
  }, [shopHours]);

  const totalW = (endMin - startMin) * PX_PER_MIN;

  const hours = useMemo(() => {
    const arr: number[] = [];
    for (let m = Math.ceil(startMin / 60) * 60; m <= endMin; m += 60)
      arr.push(m);
    return arr;
  }, [startMin, endMin]);

  const byRow = (row: {
    staffId: number | null;
    equipmentId: number | null;
  }) =>
    reservations.filter((r) => {
      if (row.staffId != null) return r.staffId === row.staffId;
      if (row.equipmentId != null)
        return r.staffId == null && r.equipmentId === row.equipmentId;
      // "指名なし" 行: スタッフも設備も付いていない予約
      return r.staffId == null && r.equipmentId == null;
    });

  const showNow =
    date === today &&
    nowMin != null &&
    nowMin >= startMin &&
    nowMin <= endMin;
  const nowLeft = showNow ? (nowMin! - startMin) * PX_PER_MIN : 0;

  const noStaff = formData.staffs.length === 0;

  const unconfirmed = reservations.filter(
    (r) => !r.confirmed && ![3, 4, 99].includes(r.status),
  ).length;

  return (
    <>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <DateNav date={date} today={today} />
        <div className="flex flex-wrap items-center gap-3">
          <CustomerCodeSearch />
          {unconfirmed > 0 && (
            <span className="rounded-lg border border-warn/40 bg-warn/10 px-2.5 py-1 text-xs font-medium text-warn">
              未確認 {unconfirmed}件
            </span>
          )}
          <Button
            size="sm"
            variant="outline"
            className="hidden sm:inline-flex"
            onClick={toggleDesktopView}
            title={
              desktopView === "timeline"
                ? "縦表示（時間が縦軸）に切り替え"
                : "横表示（時間が横軸）に切り替え"
            }
          >
            {desktopView === "timeline" ? "縦表示" : "横表示"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="sm:hidden"
            onClick={toggleMobileView}
            title={
              mobileView === "list" ? "1日表示に切り替え" : "リスト表示に切り替え"
            }
          >
            {mobileView === "list" ? "1日表示" : "リスト表示"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              window.open(
                `/reservation/print?date=${encodeURIComponent(date)}`,
                "_blank",
                "noopener,noreferrer",
              )
            }
          >
            印刷 / PDF
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              setModal({ kind: "block", mode: "create" })
            }
          >
            ＋ 時間ブロック
          </Button>
          <Button
            size="sm"
            className="hidden sm:inline-flex"
            onClick={() =>
              setModal({ kind: "appointment", mode: "create" })
            }
          >
            ＋ 新規予約
          </Button>
        </div>
      </div>

      {noStaff && (
        <p className="mb-3 rounded-xl border border-warn/30 bg-warn/10 px-3 py-2 text-xs text-warn">
          この店舗にはスタッフが登録されていません。「設定 →
          スタッフ」から追加すると担当行が表示されます。
        </p>
      )}

      {(desktopView === "day" || mobileView === "day") && (
        <div
          className={
            desktopView === "day" && mobileView === "day"
              ? ""
              : desktopView === "day"
                ? "hidden sm:block"
                : "block sm:hidden"
          }
        >
          <DayCalendar
            date={date}
            today={today}
            reservations={reservations}
            cols={rows}
            startMin={startMin}
            endMin={endMin}
            breakBand={breakBand}
            nowMin={nowMin}
            onCardClick={openCardEdit}
            onEmptyClick={(staffId, startTime) =>
              setModal({
                kind: "appointment",
                mode: "create",
                prefill: { staffId: staffId ?? undefined, startTime },
              })
            }
            onDragCreate={(target, startTime, durationMin) =>
              setModal({
                kind: "block",
                mode: "create",
                prefill: {
                  staffId: target.staffId ?? undefined,
                  equipmentId: target.equipmentId ?? undefined,
                  startTime,
                  durationMin,
                },
              })
            }
            onCardDrop={(row, newStartMin, col) =>
              setMoveTarget({
                row,
                date,
                newStartMin,
                newStaffId: col.staffId,
                newStaffName: col.name,
                newStaffColor: col.color ?? null,
              })
            }
          />
        </div>
      )}

      <div
        className={`overflow-x-auto rounded-xl border border-line bg-surface shadow-panel ${
          desktopView === "timeline" ? "hidden sm:block" : "hidden"
        }`}
      >
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
            {/* break band */}
            {breakBand &&
              breakBand.be > startMin &&
              breakBand.bs < endMin && (
                <div
                  className="pointer-events-none absolute top-0 z-0 flex items-start justify-center bg-line/40"
                  style={{
                    left:
                      STAFF_W +
                      Math.max(0, breakBand.bs - startMin) * PX_PER_MIN,
                    width:
                      (Math.min(breakBand.be, endMin) -
                        Math.max(breakBand.bs, startMin)) *
                      PX_PER_MIN,
                    height: rows.length * ROW_H,
                  }}
                >
                  <span className="mt-1 rounded bg-line px-1.5 py-0.5 text-[10px] font-medium text-muted">
                    休憩
                  </span>
                </div>
              )}

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
                  {row.staffId != null ? (
                    <Link
                      href={`/reservation/staff/${row.staffId}?date=${date}`}
                      className="truncate text-sm font-medium text-ink underline-offset-2 hover:text-accent hover:underline"
                      title={`${row.name}の週間スケジュールを表示`}
                    >
                      {row.name}
                    </Link>
                  ) : (
                    <span className="truncate text-sm font-medium text-ink">
                      {row.name}
                    </span>
                  )}
                </div>

                <div
                  className="relative flex-1 cursor-copy"
                  style={{ width: totalW }}
                  onMouseDown={(e) => {
                    if (e.button !== 0) return;
                    // 「指名なし」行 (staffId/equipmentId 共に null) のみドラッグ作成不可。
                    // スタッフ行・設備行はそれぞれの種類のブロックを作成できる。
                    if (row.staffId == null && row.equipmentId == null) return;
                    const laneEl = e.currentTarget as HTMLElement;
                    const rect = laneEl.getBoundingClientRect();
                    const x0 = e.clientX - rect.left;
                    const raw0 = startMin + x0 / PX_PER_MIN;
                    const a = Math.max(
                      startMin,
                      Math.min(endMin - 15, Math.round(raw0 / 15) * 15),
                    );
                    dragRef.current = {
                      startClientX: e.clientX,
                      laneEl,
                      staffId: row.staffId,
                      equipmentId: row.equipmentId,
                      rowKey: row.key,
                      a,
                      b: a,
                      moved: false,
                    };
                    const onMove = (ev: MouseEvent) => {
                      const d = dragRef.current;
                      if (!d) return;
                      if (
                        !d.moved &&
                        Math.abs(ev.clientX - d.startClientX) < 5
                      )
                        return;
                      d.moved = true;
                      const r = d.laneEl.getBoundingClientRect();
                      const x = ev.clientX - r.left;
                      const rawT = startMin + x / PX_PER_MIN;
                      const snappedT = Math.max(
                        startMin,
                        Math.min(endMin, Math.round(rawT / 15) * 15),
                      );
                      d.b = snappedT;
                      setDragSel({
                        rowKey: d.rowKey,
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
                        setModal({
                          kind: "block",
                          mode: "create",
                          prefill: {
                            staffId: d.staffId ?? undefined,
                            equipmentId: d.equipmentId ?? undefined,
                            startTime: minToTime(lo),
                            durationMin: duration,
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
                    const x = e.clientX - rect.left;
                    const raw = startMin + x / PX_PER_MIN;
                    const snapped = Math.round(raw / 15) * 15;
                    setModal({
                      kind: "appointment",
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
                  {dragSel && dragSel.rowKey === row.key && (
                    <div
                      className="pointer-events-none absolute top-1 z-20 rounded-md border-2 border-accent/70 bg-accent/15"
                      style={{
                        left:
                          (dragSel.startMin - startMin) * PX_PER_MIN,
                        width: Math.max(
                          15 * PX_PER_MIN,
                          (dragSel.endMin - dragSel.startMin) * PX_PER_MIN,
                        ),
                        height: ROW_H - 8,
                      }}
                    >
                      <span className="m-1 inline-block rounded bg-accent px-1.5 py-0.5 text-[10px] font-semibold leading-none text-accent-fg tabular-nums">
                        {minToTime(dragSel.startMin)}–
                        {minToTime(dragSel.endMin)}
                      </span>
                    </div>
                  )}
                  {hours.map((m) => (
                    <div
                      key={m}
                      className="absolute inset-y-0 border-l border-line/50"
                      style={{ left: (m - startMin) * PX_PER_MIN }}
                    />
                  ))}

                  {(() => {
                  const rowItems = byRow(row);
                  const laneMap = assignLanes(
                    rowItems.map((r) => ({
                      id: r.id,
                      start: jstMinutes(r.startAt),
                      end: Math.max(
                        jstMinutes(r.endAt),
                        jstMinutes(r.startAt) + 15,
                      ),
                    })),
                  );
                  const INNER_TOP = 6;
                  const AVAIL = ROW_H - 12;
                  const LANE_GAP = 2;
                  return rowItems.map((r) => {
                    const s = jstMinutes(r.startAt);
                    const e = jstMinutes(r.endAt);
                    const lay = laneMap.get(r.id) ?? { lane: 0, lanes: 1 };
                    const laneH =
                      (AVAIL - (lay.lanes - 1) * LANE_GAP) / lay.lanes;
                    const cardTop = INNER_TOP + lay.lane * (laneH + LANE_GAP);
                    const rawLeft = (s - startMin) * PX_PER_MIN;
                    const left = Math.min(
                      Math.max(0, rawLeft),
                      Math.max(0, totalW - 72),
                    );
                    const width = Math.max(
                      72,
                      Math.min(
                        (Math.max(e, s + 15) - s) * PX_PER_MIN,
                        totalW - left,
                      ),
                    );
                    const isBlock = r.kind === "block";
                    if (isBlock) {
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
                          className="absolute z-10 flex flex-col overflow-hidden rounded-lg border border-line px-2 py-1 text-left text-[11px] text-muted transition-all hover:z-20 hover:border-accent/70 hover:shadow-md"
                          style={{
                            left,
                            width,
                            top: cardTop,
                            height: laneH,
                            background:
                              "repeating-linear-gradient(45deg, rgba(155,144,121,0.22) 0 6px, rgba(155,144,121,0.08) 6px 12px)",
                          }}
                        >
                          <div className="truncate font-semibold tabular-nums text-ink">
                            {minToTime(s)}–{minToTime(e)}
                          </div>
                          <div className="truncate font-medium text-ink">
                            {label}
                          </div>
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
                        className={`absolute z-10 flex flex-col overflow-hidden rounded-lg border px-2 py-1 text-left text-[11px] shadow-sm transition-all hover:z-20 hover:border-accent/70 hover:shadow-md ${
                          cancelled
                            ? "border-line bg-elevated/60 opacity-60"
                            : "border-line bg-elevated"
                        } ${!r.confirmed && !cancelled ? "ring-2 ring-warn" : ""}`}
                        style={{
                          left,
                          width,
                          top: cardTop,
                          height: laneH,
                          background: r.cardColor || undefined,
                          borderLeftWidth: 3,
                          borderLeftColor:
                            r.visitSource?.labelTextColor ?? "#d8b06a",
                        }}
                      >
                        <div className="flex min-w-0 items-center justify-between gap-1">
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
                        {r.menu && (
                          <div className="truncate text-faint">
                            {r.menu.name}
                          </div>
                        )}
                        {!r.confirmed && !cancelled && (
                          <div className="mt-auto truncate font-semibold text-warn">
                            未確認
                          </div>
                        )}
                      </button>
                    );
                  });
                  })()}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* スマホ専用: 予約を時刻順の縦リストで表示。時間帯ごとにヘッダーを挟む */}
      <div
        className={
          mobileView === "list" ? "pb-24 sm:hidden sm:pb-0" : "hidden"
        }
      >
        {reservations.length === 0 ? (
          <p className="rounded-xl border border-line bg-surface px-4 py-10 text-center text-sm text-faint shadow-panel">
            この日の予約はありません。右下の「＋ 新規予約」から追加できます。
          </p>
        ) : (
          (() => {
            // 時間帯（時）でグループ化。空き時間帯は表示しない。
            const groups: { hour: number; items: ReservationRow[] }[] = [];
            for (const r of reservations) {
              const h = Math.floor(jstMinutes(r.startAt) / 60);
              const last = groups[groups.length - 1];
              if (last && last.hour === h) last.items.push(r);
              else groups.push({ hour: h, items: [r] });
            }
            return (
              <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-panel">
                {groups.map(({ hour, items }, gi) => (
                  <div key={hour}>
                    <div
                      className={`flex items-baseline justify-between bg-elevated/50 px-4 py-1.5 text-[11px] font-semibold tracking-wide text-muted ${
                        gi > 0 ? "border-t border-line" : ""
                      }`}
                    >
                      <span className="tabular-nums">
                        {String(hour).padStart(2, "0")}:00 〜
                      </span>
                      <span className="font-normal text-faint">
                        {items.length} 件
                      </span>
                    </div>
                    <ul className="divide-y divide-line/70">
                      {items.map((r) => {
                        const s = jstMinutes(r.startAt);
                        const e = jstMinutes(r.endAt);
                        const staffName = r.staff?.name ?? "指名なし";
                        if (r.kind === "block") {
                          const label = r.blockLabel ?? "時間ブロック";
                          return (
                            <li key={r.id}>
                              <button
                                onClick={() => openCardEdit(r)}
                                className="flex w-full items-stretch gap-3 px-4 py-3.5 text-left text-muted transition-colors active:bg-elevated/60"
                                style={{
                                  background:
                                    "repeating-linear-gradient(45deg, rgba(155,144,121,0.18) 0 6px, rgba(155,144,121,0.05) 6px 12px)",
                                }}
                              >
                                <span className="w-1 shrink-0 self-stretch rounded-full bg-faint/60" />
                                <div className="w-12 shrink-0">
                                  <div className="text-sm font-semibold tabular-nums text-ink">
                                    {minToTime(s)}
                                  </div>
                                  <div className="text-[11px] tabular-nums text-faint">
                                    {minToTime(e)}
                                  </div>
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="truncate font-medium text-ink">
                                    {label}
                                  </div>
                                  <div className="mt-1 truncate text-xs text-muted">
                                    {staffName}
                                  </div>
                                </div>
                              </button>
                            </li>
                          );
                        }
                        const meta = statusMeta(r.status);
                        const cancelled = [3, 4, 99].includes(r.status);
                        const name =
                          r.customer?.name ?? r.guestName ?? "（名称未設定）";
                        return (
                          <li key={r.id}>
                            <button
                              onClick={() => openCardEdit(r)}
                              className={`flex w-full items-stretch gap-3 px-4 py-3.5 text-left transition-colors active:bg-elevated/60 ${
                                cancelled ? "opacity-60" : ""
                              } ${!r.confirmed && !cancelled ? "bg-warn/5" : ""}`}
                              style={{ background: r.cardColor || undefined }}
                            >
                              <span
                                className="w-1 shrink-0 self-stretch rounded-full"
                                style={{
                                  background:
                                    r.visitSource?.labelTextColor ?? "#d8b06a",
                                }}
                              />
                              <div className="w-12 shrink-0">
                                <div className="text-sm font-semibold tabular-nums text-ink">
                                  {minToTime(s)}
                                </div>
                                <div className="text-[11px] tabular-nums text-faint">
                                  {minToTime(e)}
                                </div>
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  {r.customer?.code && (
                                    <span className="shrink-0 text-xs text-faint tabular-nums">
                                      No.{r.customer.code}
                                    </span>
                                  )}
                                  <span className="truncate font-medium text-ink">
                                    {name}
                                  </span>
                                  {!r.confirmed && !cancelled && (
                                    <span className="shrink-0 rounded bg-warn/15 px-1.5 py-0.5 text-[10px] font-semibold text-warn">
                                      未確認
                                    </span>
                                  )}
                                </div>
                                {r.menu && (
                                  <div className="mt-0.5 truncate text-xs text-faint">
                                    {r.menu.name}
                                  </div>
                                )}
                                <div className="mt-1 flex items-center gap-2">
                                  {r.staff?.color && (
                                    <span
                                      className="h-2 w-2 shrink-0 rounded-full ring-1 ring-line"
                                      style={{
                                        background: r.staff.color ?? undefined,
                                      }}
                                    />
                                  )}
                                  <span className="truncate text-xs text-muted">
                                    {staffName}
                                  </span>
                                </div>
                              </div>
                              <Badge
                                className={`${meta.className} shrink-0 self-start whitespace-nowrap`}
                              >
                                {meta.label}
                              </Badge>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            );
          })()
        )}
      </div>

      {reservations.length === 0 && (
        <p className="mt-4 hidden text-center text-sm text-faint sm:block">
          この日の予約はありません。タイムラインをクリックして追加できます。
        </p>
      )}

      {/* FAB（スマホ専用）: 親指リーチを優先した「＋ 新規予約」の主要動線。
          画面のどこからでもタップできる。PC は上部のボタンを使う。 */}
      <button
        type="button"
        onClick={() => setModal({ kind: "appointment", mode: "create" })}
        aria-label="新規予約を作成"
        className="fixed bottom-5 right-5 z-30 flex items-center gap-1.5 rounded-full bg-accent px-5 py-3.5 text-sm font-semibold text-accent-fg shadow-lg shadow-black/20 transition-transform active:scale-95 sm:hidden"
        style={{ marginBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <span className="text-base leading-none">＋</span>
        <span>新規予約</span>
      </button>

      {modal?.kind === "appointment" && (
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
          onOptimistic={applyOptimistic}
        />
      )}
      <MoveConfirmModal
        open={moveTarget != null}
        target={moveTarget}
        onClose={() => setMoveTarget(null)}
        onOptimistic={applyOptimistic}
      />
      {modal?.kind === "block" && (
        <TimeBlockModal
          key={
            modal.mode === "edit"
              ? `be${modal.row.id}`
              : `bc${modal.prefill?.startTime ?? ""}-${modal.prefill?.staffId ?? ""}-${modal.prefill?.equipmentId ?? ""}`
          }
          open
          onClose={() => setModal(null)}
          date={date}
          staffs={formData.staffs}
          equipments={formData.equipments}
          initial={modal.mode === "edit" ? modal.row : null}
          prefill={modal.mode === "create" ? modal.prefill : undefined}
          onOptimistic={applyOptimistic}
        />
      )}
    </>
  );
}
