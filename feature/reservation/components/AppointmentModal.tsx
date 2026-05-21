"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select, Textarea } from "@/components/ui/Input";
import { STATUS_OPTIONS } from "@/helper/utils/status";
import { timeSlots } from "@/helper/utils/timeOptions";

const TIME_SLOTS_15 = timeSlots(15);
import { appointmentSchema } from "@/feature/reservation/schema/reservationSchema";
import {
  saveAppointment,
  deleteAppointment,
  setAppointmentConfirmed,
} from "@/feature/reservation/actions/reservationActions";
import type { ReservationRow } from "@/feature/reservation/services/getReservations";

type FormData = {
  staffs: { id: number; name: string; color?: string }[];
  menus: {
    id: number;
    name: string;
    durationMin: number;
    price: number;
    menuManageId: string;
  }[];
  customers: {
    id: number;
    name: string;
    kana: string | null;
    phone: string | null;
  }[];
  visitSources: { id: number; name: string }[];
};

export function AppointmentModal({
  open,
  onClose,
  date,
  formData,
  initial,
  prefill,
}: {
  open: boolean;
  onClose: () => void;
  date: string;
  formData: FormData;
  initial?: ReservationRow | null;
  prefill?: { staffId?: number; startTime?: string };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [salesTouched, setSalesTouched] = useState(false);

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
    : 60;

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
  });

  const [custMode, setCustMode] = useState<"existing" | "new">(
    initial?.customerId ? "existing" : initial?.guestName ? "new" : "existing",
  );

  const set = <K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K],
  ) => setForm((f) => ({ ...f, [key]: value }));

  function submit() {
    setError(null);
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

    startTransition(async () => {
      const res = await saveAppointment(null, fd);
      if (res.ok) {
        onClose();
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  function remove() {
    if (!initial) return;
    if (!confirm("この予約を削除しますか？")) return;
    startTransition(async () => {
      const res = await deleteAppointment(initial.id);
      if (res.ok) {
        onClose();
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
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
              </option>
            ))}
          </Select>
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

        <div className="flex items-center justify-between pt-2">
          {isEdit ? (
            <Button variant="danger" size="sm" onClick={remove} disabled={pending}>
              削除
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={pending}>
              キャンセル
            </Button>
            <Button size="sm" onClick={submit} disabled={pending}>
              {pending ? "保存中…" : "保存"}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.kana ?? "").toLowerCase().includes(q) ||
        (c.phone ?? "").toLowerCase().includes(q),
    );
  }, [customers, query]);

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
        placeholder="氏名・カナ・電話で検索"
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
                    {c.kana && (
                      <span className="block truncate text-[11px] text-faint">
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
