"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select, Textarea } from "@/components/ui/Input";
import { STATUS_OPTIONS } from "@/helper/utils/status";
import { timeSlots } from "@/helper/utils/timeOptions";
import { addMinutes, jstDateTimeToDate } from "@/helper/utils/time";
import { filterCustomersByQuery } from "@/helper/utils/customerSort";
import { activeMenuStaffIds } from "@/helper/utils/menuStaff";

const TIME_SLOTS_15 = timeSlots(15);

const prevDateFmt = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
import { appointmentSchema } from "@/feature/reservation/schema/reservationSchema";
import {
  saveAppointment,
  deleteAppointment,
  setAppointmentConfirmed,
  getCustomerLastNote,
} from "@/feature/reservation/actions/reservationActions";
import { saveCardColorPreset, deleteCardColorPreset } from "@/feature/settings/actions/settingsActions";
import type { ReservationRow } from "@/feature/reservation/services/getReservations";
import type { ReservationOptimisticDispatch } from "@/feature/reservation/types/optimistic";

type FormData = {
  staffs: {
    id: number;
    name: string;
    color?: string;
    spotMode?: boolean;
    workDates?: string | null;
  }[];
  equipments: { id: number; name: string; color?: string }[];
  menus: {
    id: number;
    name: string;
    durationMin: number;
    price: number;
    menuManageId: string;
    requiresStaff: boolean;
    equipmentId: number | null;
    staffLinks?: { staffId: number }[];
  }[];
  customers: {
    id: number;
    code: string | null;
    name: string;
    kana: string | null;
    phone: string | null;
  }[];
  visitSources: { id: number; name: string }[];
  cardColorPresets: { id: number; name: string; hexColor: string }[];
};

export function AppointmentModal({
  open,
  onClose,
  date,
  formData,
  initial,
  prefill,
  onOptimistic,
}: {
  open: boolean;
  onClose: () => void;
  date: string;
  formData: FormData;
  initial?: ReservationRow | null;
  prefill?: { staffId?: number; startTime?: string };
  onOptimistic?: ReservationOptimisticDispatch;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [salesTouched, setSalesTouched] = useState(false);
  // 削除はネイティブ confirm() ではなくフッター内のインライン確認に置き換える。
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const isEdit = Boolean(initial);

  const toTime = (d: Date) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Tokyo",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(d));

  const toDateStr = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(d));

  const initialDuration = initial
    ? Math.round(
        (new Date(initial.endAt).getTime() -
          new Date(initial.startAt).getTime()) /
          60000,
      )
    : 15;

  const [form, setForm] = useState({
    date: initial ? toDateStr(initial.startAt) : date,
    startTime: initial
      ? toTime(initial.startAt)
      : (prefill?.startTime ?? "10:00"),
    durationMin: initialDuration,
    menuId: (initial?.menuId ?? formData.menus[0]?.id ?? "") as number | "",
    staffId: initial?.staffId ?? prefill?.staffId ?? "",
    customerId: initial?.customerId ?? "",
    visitSourceId: initial?.visitSourceId ?? "",
    guestName: initial?.guestName ?? "",
    guestPhone: initial?.guestPhone ?? "",
    status: initial?.status ?? 0,
    sales: initial?.sales ?? "",
    note: initial?.note ?? "",
    cardColor: initial?.cardColor ?? "",
  });

  const [custMode, setCustMode] = useState<"existing" | "new">(
    initial?.customerId ? "existing" : initial?.guestName ? "new" : "existing",
  );

  // 「前回の施術メモ」: 顧客選択中の場合に、その顧客の直近の予約(=前回)を取ってくる。
  // 編集中の予約自身は除外する。新規予約・新規顧客の場合は null のまま。
  type PrevNote = {
    reservationId: number;
    startAt: Date;
    menuName: string | null;
    staffName: string | null;
    note: string | null;
  };
  const [prevNote, setPrevNote] = useState<PrevNote | null>(null);
  const [prevNoteLoading, setPrevNoteLoading] = useState(false);
  const selectedCustomerId =
    custMode === "existing" && form.customerId !== ""
      ? Number(form.customerId)
      : null;
  useEffect(() => {
    if (selectedCustomerId == null) {
      setPrevNote(null);
      return;
    }
    let active = true;
    setPrevNoteLoading(true);
    getCustomerLastNote(selectedCustomerId, initial?.id)
      .then((r) => {
        if (!active) return;
        setPrevNote(r);
      })
      .catch(() => {
        if (active) setPrevNote(null);
      })
      .finally(() => {
        if (active) setPrevNoteLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedCustomerId, initial?.id]);

  const set = <K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K],
  ) => setForm((f) => ({ ...f, [key]: value }));

  // メニューの「対応スタッフ」（設定画面）。空 = 全員対応。
  // 店内での予約はブロックせず、対象外の担当を選んだときに注意書きを出すだけ。
  const menuStaffIds = useMemo(() => {
    const m =
      form.menuId === ""
        ? null
        : formData.menus.find((x) => x.id === Number(form.menuId));
    return activeMenuStaffIds(
      formData.staffs.map((s) => s.id),
      m?.staffLinks?.map((l) => l.staffId) ?? [],
    );
  }, [form.menuId, formData.menus, formData.staffs]);
  const staffOffMenu =
    menuStaffIds.length > 0 &&
    form.staffId !== "" &&
    !menuStaffIds.includes(Number(form.staffId));

  /** 楽観的更新用の ReservationRow を現在のフォーム値から組み立てる。 */
  function buildOptimisticRow(idOverride?: number): ReservationRow {
    const sId =
      typeof form.staffId === "number"
        ? form.staffId
        : form.staffId === ""
          ? null
          : Number(form.staffId);
    const cId =
      typeof form.customerId === "number"
        ? form.customerId
        : form.customerId === ""
          ? null
          : Number(form.customerId);
    const mId = form.menuId === "" ? null : Number(form.menuId);
    const vId =
      typeof form.visitSourceId === "number"
        ? form.visitSourceId
        : form.visitSourceId === ""
          ? null
          : Number(form.visitSourceId);
    const startAt = jstDateTimeToDate(form.date, form.startTime);
    const endAt = addMinutes(startAt, form.durationMin);
    const staff = sId ? (formData.staffs.find((s) => s.id === sId) ?? null) : null;
    const customer = cId
      ? (formData.customers.find((c) => c.id === cId) ?? null)
      : null;
    const menu = mId ? (formData.menus.find((m) => m.id === mId) ?? null) : null;
    return {
      id: idOverride ?? initial?.id ?? -Date.now(),
      shopId: initial?.shopId ?? 0,
      customerId: cId,
      staffId: sId,
      menuId: mId,
      visitSourceId: vId,
      bookingLinkId: initial?.bookingLinkId ?? null,
      startAt,
      endAt,
      status: form.status,
      sales: form.sales === "" ? null : Number(form.sales),
      note: form.note || null,
      cardColor: form.cardColor || null,
      isMemberJoin: initial?.isMemberJoin ?? false,
      source: initial?.source ?? "manual",
      confirmed: initial?.confirmed ?? true,
      kind: initial?.kind ?? "appointment",
      blockLabel: initial?.blockLabel ?? null,
      guestName: cId ? null : form.guestName || null,
      guestPhone: cId ? null : form.guestPhone || null,
      createdAt: initial?.createdAt ?? new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      customer: customer
        ? { id: customer.id, name: customer.name, phone: customer.phone }
        : null,
      staff: staff
        ? { id: staff.id, name: staff.name, color: staff.color ?? null }
        : null,
      menu: menu
        ? { id: menu.id, name: menu.name, durationMin: menu.durationMin }
        : null,
      visitSource: initial?.visitSource ?? null,
    } as unknown as ReservationRow;
  }

  function submit(continueCreate: boolean = false) {
    setError(null);
    setSuccessMsg(null);
    const payload = {
      ...(initial ? { id: initial.id } : {}),
      date: form.date,
      startTime: form.startTime,
      durationMin: form.durationMin,
      menuId: form.menuId || undefined,
      staffId: form.staffId || undefined,
      customerId: form.customerId || undefined,
      visitSourceId: form.visitSourceId || undefined,
      // A registered customer and a free-text guest are mutually exclusive.
      guestName: form.customerId ? undefined : form.guestName || undefined,
      guestPhone: form.customerId ? undefined : form.guestPhone || undefined,
      status: form.status,
      sales: form.sales === "" ? undefined : form.sales,
      note: form.note || undefined,
      cardColor: form.cardColor || undefined,
    };

    const parsed = appointmentSchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "入力内容を確認してください");
      return;
    }

    const fd = new FormData();
    Object.entries(payload).forEach(([k, v]) => {
      if (v !== undefined && v !== null) fd.set(k, String(v));
    });

    const optimisticRow = buildOptimisticRow();
    const isUpdate = Boolean(initial?.id);

    startTransition(async () => {
      onOptimistic?.(
        isUpdate
          ? { type: "update", row: optimisticRow }
          : { type: "add", row: optimisticRow },
      );
      let res = await saveAppointment(null, fd);

      // スタッフ/設備が埋まっている場合は、手動に限り「枠を追加」して登録できる。
      if (!res.ok && res.conflict) {
        const target = res.conflict === "equipment" ? "設備" : "担当スタッフ";
        const proceed = window.confirm(
          `${target}はこの時間帯に別の予約があります。\n枠を追加してこの予約を登録しますか？`,
        );
        if (proceed) {
          fd.set("allowOverlap", "1");
          res = await saveAppointment(null, fd);
        } else {
          // 取り消し: 楽観的に表示した行をサーバー状態へ戻す。
          router.refresh();
          return;
        }
      }

      if (res.ok) {
        if (continueCreate && !isUpdate) {
          // 同じ顧客で続けて入力できるよう、開始時刻だけ進めて他は維持。
          const startAt = jstDateTimeToDate(form.date, form.startTime);
          const nextStart = addMinutes(startAt, form.durationMin);
          const nextStartTime = toTime(nextStart);
          setForm((f) => ({
            ...f,
            startTime: nextStartTime,
            sales: "",
            note: "",
            status: 0,
          }));
          setSalesTouched(false);
          setSuccessMsg(
            "保存しました。続けて新規予約を入力できます（顧客・メニュー・担当は維持）。",
          );
          router.refresh();
        } else {
          onClose();
          router.refresh();
        }
      } else {
        setError(res.error);
      }
    });
  }

  function remove() {
    if (!initial) return;
    startTransition(async () => {
      onOptimistic?.({ type: "delete", id: initial.id });
      const res = await deleteAppointment(initial.id);
      if (res.ok) {
        onClose();
        router.refresh();
      } else {
        setError(res.error);
        setConfirmingDelete(false);
      }
    });
  }

  const footer = confirmingDelete ? (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-ink">この予約を削除しますか？</span>
      <div className="flex gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setConfirmingDelete(false)}
          disabled={pending}
        >
          キャンセル
        </Button>
        <Button variant="danger" size="sm" onClick={remove} disabled={pending}>
          {pending ? "削除中…" : "削除する"}
        </Button>
      </div>
    </div>
  ) : (
    <div className="flex items-center justify-between gap-2">
      {isEdit ? (
        <Button
          variant="danger"
          size="sm"
          onClick={() => setConfirmingDelete(true)}
          disabled={pending}
        >
          削除
        </Button>
      ) : (
        <span />
      )}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose} disabled={pending}>
          キャンセル
        </Button>
        {!isEdit && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => submit(true)}
            disabled={pending}
            title="保存後に同じ顧客・メニュー・担当でもう1件入力します"
          >
            {pending ? "保存中…" : "保存して続けて入力"}
          </Button>
        )}
        <Button size="sm" onClick={() => submit(false)} disabled={pending}>
          {pending ? "保存中…" : "保存"}
        </Button>
      </div>
    </div>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      footer={footer}
      title={isEdit ? "予約の編集" : "新規予約"}
    >
      <div className="space-y-4">
        {isEdit && initial && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-base/40 px-3 py-2.5">
            <div className="text-sm">
              <span className="text-muted">確認状況：</span>
              {initial.confirmed ? (
                <span className="font-medium text-ok">確認済み</span>
              ) : (
                <span className="font-medium text-warn">未確認</span>
              )}
              {(initial.guestPhone || initial.customer?.phone) && (
                <span className="ml-3 text-muted">
                  TEL：{initial.guestPhone ?? initial.customer?.phone}
                </span>
              )}
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  setError(null);
                  onOptimistic?.({
                    type: "update",
                    row: { ...initial, confirmed: !initial.confirmed },
                  });
                  const r = await setAppointmentConfirmed(
                    initial.id,
                    !initial.confirmed,
                  );
                  if (r.ok) {
                    onClose();
                    router.refresh();
                  } else {
                    setError(r.error);
                  }
                })
              }
            >
              {initial.confirmed ? "未確認に戻す" : "確認済みにする"}
            </Button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>日付</Label>
            <Input
              type="date"
              value={form.date}
              onChange={(e) => set("date", e.target.value)}
              className="date-input-tight"
            />
          </div>
          <div>
            <Label>開始時刻（15分単位）</Label>
            <Select
              value={form.startTime}
              onChange={(e) => set("startTime", e.target.value)}
            >
              {(TIME_SLOTS_15.includes(form.startTime)
                ? TIME_SLOTS_15
                : [form.startTime, ...TIME_SLOTS_15]
              ).map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>メニュー</Label>
            <MenuCombobox
              menus={formData.menus}
              selectedId={form.menuId === "" ? null : Number(form.menuId)}
              onSelect={(m) =>
                setForm((f) => ({
                  ...f,
                  menuId: m ? m.id : "",
                  durationMin: m?.durationMin ?? f.durationMin,
                  sales: !salesTouched && m ? m.price : f.sales,
                }))
              }
            />
          </div>
          <div>
            <Label>施術時間（分）</Label>
            <Input
              type="number"
              min={5}
              step={5}
              value={form.durationMin}
              onChange={(e) => set("durationMin", Number(e.target.value))}
            />
          </div>
        </div>

        <div>
          <Label>担当スタッフ</Label>
          <Select
            value={form.staffId}
            onChange={(e) => set("staffId", e.target.value)}
          >
            <option value="">（指名なし）</option>
            {formData.staffs.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {menuStaffIds.length > 0 && !menuStaffIds.includes(s.id)
                  ? "（このメニュー対象外）"
                  : ""}
              </option>
            ))}
          </Select>
          {staffOffMenu && (
            <p className="mt-1 text-xs text-warn">
              このメニューの対応スタッフに設定されていません（
              {formData.staffs
                .filter((s) => menuStaffIds.includes(s.id))
                .map((s) => s.name)
                .join("・")}
              ）。このまま保存もできます。
            </p>
          )}
        </div>

        <div>
          <Label>顧客区分</Label>
          <div className="inline-flex rounded-xl border border-line bg-base p-1">
            <button
              type="button"
              onClick={() => {
                setCustMode("existing");
                setForm((f) => ({ ...f, guestName: "", guestPhone: "" }));
              }}
              className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
                custMode === "existing"
                  ? "bg-accent text-accent-fg"
                  : "text-muted hover:text-ink"
              }`}
            >
              既存顧客
            </button>
            <button
              type="button"
              onClick={() => {
                setCustMode("new");
                setForm((f) => ({ ...f, customerId: "" }));
              }}
              className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
                custMode === "new"
                  ? "bg-accent text-accent-fg"
                  : "text-muted hover:text-ink"
              }`}
            >
              新規顧客
            </button>
          </div>
        </div>

        {custMode === "existing" ? (
          <div>
            <Label>顧客</Label>
            <CustomerCombobox
              customers={formData.customers}
              selectedId={form.customerId === "" ? null : Number(form.customerId)}
              onSelect={(c) =>
                setForm((f) => ({ ...f, customerId: c ? c.id : "" }))
              }
            />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>来店者名</Label>
                <Input
                  value={form.guestName}
                  onChange={(e) => set("guestName", e.target.value)}
                  placeholder="山田 太郎"
                />
              </div>
              <div>
                <Label>電話番号</Label>
                <Input
                  value={form.guestPhone}
                  onChange={(e) => set("guestPhone", e.target.value)}
                  placeholder="090-0000-0000"
                />
              </div>
            </div>
            <div>
              <Label>来店経路</Label>
              <Select
                value={form.visitSourceId}
                onChange={(e) => set("visitSourceId", e.target.value)}
              >
                <option value="">（未選択）</option>
                {formData.visitSources.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </Select>
            </div>
          </>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>売上（円）</Label>
            <Input
              type="number"
              min={0}
              value={form.sales}
              onChange={(e) => {
                setSalesTouched(true);
                set(
                  "sales",
                  e.target.value === "" ? "" : Number(e.target.value),
                );
              }}
              placeholder="0"
            />
          </div>
        </div>

        {isEdit && (
          <div>
            <Label>ステータス</Label>
            <Select
              value={form.status}
              onChange={(e) => set("status", Number(e.target.value))}
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>
        )}

        {selectedCustomerId != null && (
          <div className="rounded-xl border border-line bg-base/40 px-3 py-2.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs font-semibold text-muted">
                前回の施術メモ
              </span>
              {prevNote?.note && (
                <button
                  type="button"
                  onClick={() => set("note", prevNote.note ?? "")}
                  className="text-[11px] text-accent underline-offset-2 hover:underline"
                >
                  今回のメモにコピー
                </button>
              )}
            </div>
            {prevNoteLoading ? (
              <p className="mt-1 text-xs text-faint">読み込み中…</p>
            ) : !prevNote ? (
              <p className="mt-1 text-xs text-faint">
                この患者の過去の予約はありません
              </p>
            ) : (
              <>
                <div className="mt-1 text-[11px] text-faint">
                  {prevDateFmt.format(new Date(prevNote.startAt))}
                  {prevNote.menuName ? ` ・ ${prevNote.menuName}` : ""}
                  {prevNote.staffName ? ` ・ ${prevNote.staffName}` : ""}
                </div>
                {prevNote.note ? (
                  <p className="mt-1.5 whitespace-pre-wrap text-xs text-ink">
                    {prevNote.note}
                  </p>
                ) : (
                  <p className="mt-1.5 text-xs italic text-faint">
                    （前回はメモなし）
                  </p>
                )}
              </>
            )}
          </div>
        )}

        <CardColorPicker
          value={form.cardColor}
          onChange={(v) => set("cardColor", v)}
          presets={formData.cardColorPresets}
        />

        <div>
          <Label>メモ</Label>
          <Textarea
            value={form.note}
            onChange={(e) => set("note", e.target.value)}
            placeholder="施術内容や申し送り事項"
          />
        </div>

        {error && (
          <p className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
            {error}
          </p>
        )}
        {successMsg && (
          <p className="rounded-xl border border-ok/30 bg-ok/10 px-3 py-2 text-xs text-ok">
            {successMsg}
          </p>
        )}
      </div>
    </Modal>
  );
}

/**
 * 予約カードの背景色ピッカー。
 *  - 任意の色をカラーピッカーで選べる（既存の挙動）
 *  - 保存済みプリセット（CardColorPreset）をチップ表示し、タップで適用
 *  - 「現在の色を保存」で名前を付けて新規プリセット登録（モーダル外と即時連携）
 *  - チップ長押し（または ✕）で削除
 *
 * プリセットは router.refresh() でサーバから再取得する（formData は server
 * component 側で next の revalidate を介して更新される）。
 */
function CardColorPicker({
  value,
  onChange,
  presets,
}: {
  value: string;
  onChange: (v: string) => void;
  presets: { id: number; name: string; hexColor: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const trimmed = (value ?? "").trim();
  const hasValue = trimmed.length > 0;

  function savePreset() {
    setErr(null);
    const hex = trimmed || "#d8b06a";
    const name = presetName.trim();
    if (!name) {
      setErr("名前を入力してください");
      return;
    }
    const fd = new globalThis.FormData();
    fd.set("name", name);
    fd.set("hexColor", hex);
    startTransition(async () => {
      const r = await saveCardColorPreset(null, fd);
      if (r.ok) {
        setPresetName("");
        setSaving(false);
        router.refresh();
      } else {
        setErr(r.error);
      }
    });
  }

  function removePreset(id: number) {
    if (!confirm("この色プリセットを削除しますか？")) return;
    startTransition(async () => {
      const r = await deleteCardColorPreset(id);
      if (r.ok) router.refresh();
      else setErr(r.error);
    });
  }

  return (
    <div>
      <Label>背景色</Label>
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="color"
          value={trimmed || "#d8b06a"}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-12 shrink-0 cursor-pointer rounded-lg border border-line bg-base p-1"
          aria-label="予約カードの背景色"
        />
        <span className="text-sm tabular-nums text-muted">
          {hasValue ? trimmed : "デフォルト（自動）"}
        </span>
        {hasValue && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="text-xs text-accent underline-offset-2 hover:underline"
          >
            デフォルトに戻す
          </button>
        )}
        {hasValue && !saving && (
          <button
            type="button"
            onClick={() => setSaving(true)}
            className="text-xs text-accent underline-offset-2 hover:underline"
          >
            現在の色を保存
          </button>
        )}
      </div>

      {saving && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-base/40 px-3 py-2">
          <span
            className="h-5 w-5 shrink-0 rounded border border-line"
            style={{ background: trimmed || "#d8b06a" }}
          />
          <Input
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            placeholder="名前（例: 新規さん / 要相談）"
            className="!h-8 max-w-[16rem]"
            maxLength={40}
            autoFocus
          />
          <Button size="sm" onClick={savePreset} disabled={pending}>
            {pending ? "保存中…" : "保存"}
          </Button>
          <button
            type="button"
            onClick={() => {
              setSaving(false);
              setPresetName("");
              setErr(null);
            }}
            className="text-xs text-muted underline-offset-2 hover:underline"
            disabled={pending}
          >
            キャンセル
          </button>
        </div>
      )}

      {presets.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {presets.map((p) => {
            const selected =
              trimmed.toLowerCase() === p.hexColor.toLowerCase();
            return (
              <span
                key={p.id}
                className={`inline-flex items-center gap-1.5 rounded-full border bg-surface py-1 pl-1 pr-2 text-xs transition-colors ${
                  selected
                    ? "border-accent/70 ring-1 ring-accent/30"
                    : "border-line hover:border-accent/60"
                }`}
              >
                <button
                  type="button"
                  onClick={() => onChange(p.hexColor)}
                  className="inline-flex items-center gap-1.5"
                  title={`${p.name} (${p.hexColor})`}
                >
                  <span
                    className="h-3.5 w-3.5 shrink-0 rounded-full ring-1 ring-line"
                    style={{ background: p.hexColor }}
                  />
                  <span className="text-ink">{p.name}</span>
                </button>
                <button
                  type="button"
                  onClick={() => removePreset(p.id)}
                  className="text-faint hover:text-danger"
                  aria-label={`${p.name} を削除`}
                  disabled={pending}
                >
                  ✕
                </button>
              </span>
            );
          })}
        </div>
      )}

      {err && (
        <p className="mt-2 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
          {err}
        </p>
      )}

      <p className="mt-1 text-[11px] text-faint">
        予約カードの背景色を自由に変更できます。保存しておくと「予約枠の色」として
        いつでも再利用できます（顧客側には表示されません）。
      </p>
    </div>
  );
}

function MenuCombobox({
  menus,
  selectedId,
  onSelect,
}: {
  menus: FormData["menus"];
  selectedId: number | null;
  onSelect: (m: FormData["menus"][number] | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const selected = useMemo(
    () => menus.find((m) => m.id === selectedId) ?? null,
    [menus, selectedId],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return menus;
    return menus.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.menuManageId.toLowerCase().includes(q),
    );
  }, [menus, query]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const display = open
    ? query
    : selected
      ? `${selected.name}（${selected.durationMin}分 / ¥${selected.price.toLocaleString()}）`
      : "";

  return (
    <div ref={ref} className="relative">
      <Input
        type="text"
        value={display}
        placeholder="メニュー名・IDで検索"
        onFocus={() => {
          setOpen(true);
          setQuery("");
        }}
        onChange={(e) => {
          if (!open) setOpen(true);
          setQuery(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
          if (e.key === "Enter" && open && filtered[0]) {
            e.preventDefault();
            onSelect(filtered[0]);
            setOpen(false);
            setQuery("");
          }
        }}
      />
      {open && (
        <ul className="absolute z-30 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-line bg-surface shadow-panel">
          {selected && (
            <li>
              <button
                type="button"
                onMouseDown={(ev) => ev.preventDefault()}
                onClick={() => {
                  onSelect(null);
                  setOpen(false);
                  setQuery("");
                }}
                className="w-full border-b border-line/60 px-3 py-2 text-left text-sm text-faint hover:bg-elevated"
              >
                選択を解除
              </button>
            </li>
          )}
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-faint">候補がありません</li>
          ) : (
            filtered.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onMouseDown={(ev) => ev.preventDefault()}
                  onClick={() => {
                    onSelect(m);
                    setOpen(false);
                    setQuery("");
                  }}
                  className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-elevated ${selectedId === m.id ? "bg-elevated/60" : ""}`}
                >
                  <span className="min-w-0 truncate font-medium text-ink">
                    {m.name}
                  </span>
                  <span className="shrink-0 tabular-nums text-xs text-faint">
                    {m.durationMin}分 / ¥{m.price.toLocaleString()}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

function CustomerCombobox({
  customers,
  selectedId,
  onSelect,
}: {
  customers: FormData["customers"];
  selectedId: number | null;
  onSelect: (c: FormData["customers"][number] | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const selected = useMemo(
    () => customers.find((c) => c.id === selectedId) ?? null,
    [customers, selectedId],
  );

  const filtered = useMemo(
    () => filterCustomersByQuery(customers, query),
    [customers, query],
  );

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const display = open
    ? query
    : selected
      ? `${selected.name}${selected.phone ? `（${selected.phone}）` : ""}`
      : "";

  return (
    <div ref={ref} className="relative">
      <Input
        type="text"
        value={display}
        placeholder="患者番号・氏名・カナで検索（電話番号も可）"
        onFocus={() => {
          setOpen(true);
          setQuery("");
        }}
        onChange={(e) => {
          if (!open) setOpen(true);
          setQuery(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
          if (e.key === "Enter" && open && filtered[0]) {
            e.preventDefault();
            onSelect(filtered[0]);
            setOpen(false);
            setQuery("");
          }
        }}
      />
      {open && (
        <ul className="absolute z-30 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-line bg-surface shadow-panel">
          {selected && (
            <li>
              <button
                type="button"
                onMouseDown={(ev) => ev.preventDefault()}
                onClick={() => {
                  onSelect(null);
                  setOpen(false);
                  setQuery("");
                }}
                className="w-full border-b border-line/60 px-3 py-2 text-left text-sm text-faint hover:bg-elevated"
              >
                選択を解除
              </button>
            </li>
          )}
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-faint">
              候補がありません（「顧客」画面から登録できます）
            </li>
          ) : (
            filtered.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onMouseDown={(ev) => ev.preventDefault()}
                  onClick={() => {
                    onSelect(c);
                    setOpen(false);
                    setQuery("");
                  }}
                  className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-elevated ${selectedId === c.id ? "bg-elevated/60" : ""}`}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-ink">
                      {c.name}
                    </span>
                    {(c.code || c.kana) && (
                      <span className="block truncate text-[11px] text-faint">
                        {c.code && (
                          <span className="tabular-nums">No.{c.code}</span>
                        )}
                        {c.code && c.kana ? " ・ " : ""}
                        {c.kana}
                      </span>
                    )}
                  </span>
                  {c.phone && (
                    <span className="shrink-0 tabular-nums text-xs text-faint">
                      {c.phone}
                    </span>
                  )}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
