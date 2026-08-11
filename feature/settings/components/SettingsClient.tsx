"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input, Label, Select } from "@/components/ui/Input";
import { toLocalDateString, formatJpDate } from "@/helper/utils/time";
import { parseWorkDates, serializeWorkDates } from "@/helper/utils/staffWork";
import {
  parseHoursByDow,
  serializeHoursByDow,
  parseDateOverrides,
  serializeDateOverrides,
  type DowOverride,
  type HoursByDow,
  type DateOverride,
  type DateOverrides,
  type DateOverrideType,
} from "@/helper/utils/shopHours";

const DATE_OV_LABEL: Record<DateOverrideType, string> = {
  closed: "全日休",
  morning: "午前休",
  afternoon: "午後休",
};
const DATE_OV_BADGE: Record<DateOverrideType, string> = {
  closed: "border-danger/40 bg-danger/15 text-danger",
  morning: "border-info/40 bg-info/15 text-info",
  afternoon: "border-warn/40 bg-warn/15 text-warn",
};

function shiftMonth(monthStr: string, delta: number): string {
  const [y, m] = monthStr.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function buildMonthCells(monthStr: string): (string | null)[][] {
  const [y, m] = monthStr.split("-").map(Number);
  const startDow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const flat: (string | null)[] = [];
  for (let i = 0; i < 42; i++) {
    const dayNum = i - startDow + 1;
    if (dayNum < 1 || dayNum > daysInMonth) {
      flat.push(null);
    } else {
      flat.push(
        `${y}-${String(m).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`,
      );
    }
  }
  const rows: (string | null)[][] = [];
  for (let i = 0; i < 6; i++) rows.push(flat.slice(i * 7, (i + 1) * 7));
  return rows;
}

const DOW_LABELS: { key: string; label: string }[] = [
  { key: "1", label: "月" },
  { key: "2", label: "火" },
  { key: "3", label: "水" },
  { key: "4", label: "木" },
  { key: "5", label: "金" },
  { key: "6", label: "土" },
  { key: "0", label: "日" },
];
import {
  saveShop,
  deleteShop,
  saveStaff,
  deleteStaff,
  saveEquipment,
  deleteEquipment,
  saveMenu,
  deleteMenu,
  saveVisitSource,
  deleteVisitSource,
  ensureDefaultVisitSources,
  saveCardColorPreset,
  deleteCardColorPreset,
  type ActionResult,
} from "@/feature/settings/actions/settingsActions";
import type {
  ShopRow,
  StaffRow,
  EquipmentRow,
  MenuRow,
  VisitSourceRow,
  CardColorPresetRow,
} from "@/feature/settings/services/getSettingsData";

type Tab = "shops" | "staff" | "equipments" | "menus" | "vsources" | "cardColors";

const TABS: { key: Tab; label: string }[] = [
  { key: "shops", label: "店舗" },
  { key: "staff", label: "スタッフ" },
  { key: "equipments", label: "設備" },
  { key: "menus", label: "メニュー" },
  { key: "vsources", label: "来店経路" },
  { key: "cardColors", label: "予約枠の色" },
];

export function SettingsClient({
  shops,
  staffs,
  equipments,
  menus,
  visitSources,
  cardColorPresets,
  activeShopName,
}: {
  shops: ShopRow[];
  staffs: StaffRow[];
  equipments: EquipmentRow[];
  menus: MenuRow[];
  visitSources: VisitSourceRow[];
  cardColorPresets: CardColorPresetRow[];
  activeShopName: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("shops");
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [modal, setModal] = useState<ReactNode | null>(null);

  const run = (fn: () => Promise<ActionResult>, onOk?: () => void) =>
    startTransition(async () => {
      setErr(null);
      try {
        const r = await fn();
        if (!r.ok) {
          setErr(r.error);
          return;
        }
        onOk?.();
        router.refresh();
      } catch {
        setErr("操作に失敗しました。時間をおいて再度お試しください");
      }
    });

  const submitForm = (
    action: (p: ActionResult | null, fd: FormData) => Promise<ActionResult>,
    fd: FormData,
  ) => run(() => action(null, fd), () => setModal(null));

  return (
    <div>
      <div className="mb-6 inline-flex rounded-xl border border-line bg-surface p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => {
              setTab(t.key);
              setErr(null);
            }}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
              tab === t.key
                ? "bg-accent text-accent-fg"
                : "text-muted hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {err && (
        <p className="mb-4 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {err}
        </p>
      )}

      {tab === "shops" && (
        <Section
          title="店舗一覧"
          onAdd={() =>
            setModal(
              <ShopForm
                onClose={() => setModal(null)}
                onSubmit={(fd) => submitForm(saveShop, fd)}
                pending={pending}
              />,
            )
          }
        >
          {shops.length === 0 && <Empty>店舗がありません</Empty>}
          {shops.map((s) => (
            <Row
              key={s.id}
              title={s.name}
              meta={
                <span className="text-faint">
                  表示順 {s.sortNumber}
                  {s.phone ? ` ・ ${s.phone}` : ""}
                  {s.address ? ` ・ ${s.address}` : ""}
                </span>
              }
              onEdit={() =>
                setModal(
                  <ShopForm
                    initial={s}
                    onClose={() => setModal(null)}
                    onSubmit={(fd) => submitForm(saveShop, fd)}
                    pending={pending}
                  />,
                )
              }
              onDelete={() => {
                if (confirm(`「${s.name}」を削除しますか？`))
                  run(() => deleteShop(s.id));
              }}
              pending={pending}
            />
          ))}
        </Section>
      )}

      {tab === "staff" && (
        <Section
          title={`スタッフ一覧（${activeShopName}）`}
          hint="表示中の店舗のスタッフです。指名なし予約は「割当優先順」が小さい人から空いている順で自動割当されます。"
          onAdd={() =>
            setModal(
              <StaffForm
                onClose={() => setModal(null)}
                onSubmit={(fd) => submitForm(saveStaff, fd)}
                pending={pending}
              />,
            )
          }
        >
          {staffs.length === 0 && <Empty>スタッフがいません</Empty>}
          {staffs.map((s) => (
            <Row
              key={s.id}
              title={
                <span className="flex items-center gap-2">
                  <span
                    className="inline-block h-3 w-3 rounded-full ring-1 ring-line"
                    style={{ background: s.color }}
                  />
                  {s.name}
                </span>
              }
              meta={
                <span className="flex items-center gap-2 text-faint">
                  割当優先順 {s.allocateOrder}
                  {s.spotMode && (
                    <Badge className="border-accent/30 bg-accent/10 text-accent-hover">
                      臨時 {parseWorkDates(s.workDates).length}日
                    </Badge>
                  )}
                  {s.isBookable ? (
                    <Badge className="border-ok/30 bg-ok/15 text-ok">
                      予約可
                    </Badge>
                  ) : (
                    <Badge className="border-line bg-base text-faint">
                      予約不可
                    </Badge>
                  )}
                </span>
              }
              onEdit={() =>
                setModal(
                  <StaffForm
                    initial={s}
                    onClose={() => setModal(null)}
                    onSubmit={(fd) => submitForm(saveStaff, fd)}
                    pending={pending}
                  />,
                )
              }
              onDelete={() => {
                if (confirm(`「${s.name}」を削除しますか？`))
                  run(() => deleteStaff(s.id));
              }}
              pending={pending}
            />
          ))}
        </Section>
      )}

      {tab === "equipments" && (
        <Section
          title={`設備一覧（${activeShopName}）`}
          hint="楽トレ・水素吸引機など、メニューで使う機器・設備。メニュー側で「使う設備」を指定すると、その時間帯の設備の空き状況も自動でチェックされます。"
          onAdd={() =>
            setModal(
              <EquipmentForm
                onClose={() => setModal(null)}
                onSubmit={(fd) => submitForm(saveEquipment, fd)}
                pending={pending}
              />,
            )
          }
        >
          {equipments.length === 0 && <Empty>設備がありません</Empty>}
          {equipments.map((e) => (
            <Row
              key={e.id}
              title={
                <span className="flex items-center gap-2">
                  <span
                    className="inline-block h-3 w-3 rounded-full ring-1 ring-line"
                    style={{ background: e.color }}
                  />
                  {e.name}
                </span>
              }
              meta={
                <span className="flex items-center gap-2 text-faint">
                  表示順 {e.sortNumber}
                  {e.isBookable ? (
                    <Badge className="border-ok/30 bg-ok/15 text-ok">
                      予約可
                    </Badge>
                  ) : (
                    <Badge className="border-line bg-base text-faint">
                      予約不可
                    </Badge>
                  )}
                </span>
              }
              onEdit={() =>
                setModal(
                  <EquipmentForm
                    initial={e}
                    onClose={() => setModal(null)}
                    onSubmit={(fd) => submitForm(saveEquipment, fd)}
                    pending={pending}
                  />,
                )
              }
              onDelete={() => {
                if (confirm(`「${e.name}」を削除しますか？`))
                  run(() => deleteEquipment(e.id));
              }}
              pending={pending}
            />
          ))}
        </Section>
      )}

      {tab === "menus" && (
        <Section
          title="メニュー一覧"
          hint={`「対応スタッフ」を設定すると、そのメニューはオンライン予約で対象スタッフにしか割り当てられません（${activeShopName}のスタッフで設定します）。`}
          onAdd={() =>
            setModal(
              <MenuForm
                equipments={equipments}
                staffs={staffs}
                activeShopName={activeShopName}
                onClose={() => setModal(null)}
                onSubmit={(fd) => submitForm(saveMenu, fd)}
                pending={pending}
              />,
            )
          }
        >
          {menus.length === 0 && <Empty>メニューがありません</Empty>}
          {menus.map((m) => {
            const eqName =
              m.equipmentId != null
                ? (equipments.find((e) => e.id === m.equipmentId)?.name ??
                  null)
                : null;
            // 対応スタッフは店舗ごと。表示中の店舗に在籍する人だけを出す。
            const menuStaffNames = m.staffLinks
              .map((l) => staffs.find((s) => s.id === l.staffId)?.name)
              .filter((n): n is string => Boolean(n));
            return (
            <Row
              key={m.id}
              title={m.name}
              meta={
                <span className="flex items-center gap-2 text-faint">
                  {m.durationMin}分 ・ ¥{m.price.toLocaleString()}
                  {m.shopId == null ? (
                    <Badge className="border-info/30 bg-info/10 text-info">
                      全店舗共通
                    </Badge>
                  ) : (
                    <Badge className="border-line bg-base text-muted">
                      この店舗のみ
                    </Badge>
                  )}
                  {!m.requiresStaff && (
                    <Badge className="border-line bg-base text-muted">
                      スタッフ不要
                    </Badge>
                  )}
                  {m.requiresStaff &&
                    (menuStaffNames.length > 0 ? (
                      <Badge className="border-accent/40 bg-accent/10 text-accent-hover">
                        対応: {menuStaffNames.join("・")}
                      </Badge>
                    ) : (
                      <Badge className="border-line bg-base text-faint">
                        対応: 全員
                      </Badge>
                    ))}
                  {eqName && (
                    <Badge className="border-accent/30 bg-accent/10 text-accent-hover">
                      設備: {eqName}
                    </Badge>
                  )}
                  {!m.isPublic && (
                    <Badge className="border-line bg-base text-faint">
                      非公開
                    </Badge>
                  )}
                </span>
              }
              onEdit={() =>
                setModal(
                  <MenuForm
                    initial={m}
                    equipments={equipments}
                    staffs={staffs}
                    activeShopName={activeShopName}
                    onClose={() => setModal(null)}
                    onSubmit={(fd) => submitForm(saveMenu, fd)}
                    pending={pending}
                  />,
                )
              }
              onDelete={() => {
                if (confirm(`「${m.name}」を削除しますか？`))
                  run(() => deleteMenu(m.id));
              }}
              pending={pending}
            />
            );
          })}
        </Section>
      )}

      {tab === "vsources" && (
        <Section
          title={`来店経路（${activeShopName}）`}
          hint="新規顧客の予約時に選べる流入経路です。"
          onAdd={() =>
            setModal(
              <VisitSourceForm
                onClose={() => setModal(null)}
                onSubmit={(fd) => submitForm(saveVisitSource, fd)}
                pending={pending}
              />,
            )
          }
          extra={
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => run(() => ensureDefaultVisitSources())}
            >
              標準経路を追加（紹介/meta/チラシ/HP）
            </Button>
          }
        >
          {visitSources.length === 0 && (
            <Empty>来店経路がありません</Empty>
          )}
          {visitSources.map((v) => (
            <Row
              key={v.id}
              title={v.name}
              meta={
                <span className="text-faint">表示順 {v.sortNumber}</span>
              }
              onEdit={() =>
                setModal(
                  <VisitSourceForm
                    initial={v}
                    onClose={() => setModal(null)}
                    onSubmit={(fd) => submitForm(saveVisitSource, fd)}
                    pending={pending}
                  />,
                )
              }
              onDelete={() => {
                if (confirm(`「${v.name}」を削除しますか？`))
                  run(() => deleteVisitSource(v.id));
              }}
              pending={pending}
            />
          ))}
        </Section>
      )}

      {tab === "cardColors" && (
        <Section
          title={`予約枠の色（${activeShopName}）`}
          hint="予約モーダルで保存した色プリセットの一覧。名前と色をいつでも編集・削除できます。"
          onAdd={() =>
            setModal(
              <CardColorPresetForm
                onClose={() => setModal(null)}
                onSubmit={(fd) => submitForm(saveCardColorPreset, fd)}
                pending={pending}
              />,
            )
          }
        >
          {cardColorPresets.length === 0 && (
            <Empty>保存済みの色プリセットはありません</Empty>
          )}
          {cardColorPresets.map((c) => (
            <Row
              key={c.id}
              title={c.name}
              meta={
                <span className="flex items-center gap-2">
                  <span
                    className="h-4 w-4 shrink-0 rounded ring-1 ring-line"
                    style={{ background: c.hexColor }}
                  />
                  <span className="tabular-nums text-faint">
                    {c.hexColor}
                  </span>
                  <span className="text-faint">・ 表示順 {c.sortNumber}</span>
                </span>
              }
              onEdit={() =>
                setModal(
                  <CardColorPresetForm
                    initial={c}
                    onClose={() => setModal(null)}
                    onSubmit={(fd) => submitForm(saveCardColorPreset, fd)}
                    pending={pending}
                  />,
                )
              }
              onDelete={() => {
                if (confirm(`「${c.name}」を削除しますか？`))
                  run(() => deleteCardColorPreset(c.id));
              }}
              pending={pending}
            />
          ))}
        </Section>
      )}

      {modal}
    </div>
  );
}

/* ---------------- shared list UI ---------------- */

function Section({
  title,
  hint,
  onAdd,
  extra,
  children,
}: {
  title: string;
  hint?: string;
  onAdd: () => void;
  extra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface shadow-panel">
      <div className="flex flex-col gap-3 border-b border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold tracking-wide text-ink">
            {title}
          </h2>
          {hint && <p className="mt-0.5 text-xs text-faint">{hint}</p>}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {extra}
          <Button size="sm" onClick={onAdd}>
            ＋ 追加
          </Button>
        </div>
      </div>
      <ul className="divide-y divide-line/70">{children}</ul>
    </div>
  );
}

function Row({
  title,
  meta,
  onEdit,
  onDelete,
  pending,
}: {
  title: ReactNode;
  meta?: ReactNode;
  onEdit: () => void;
  onDelete: () => void;
  pending: boolean;
}) {
  return (
    <li className="flex items-center justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-elevated/40">
      <div className="min-w-0">
        <div className="truncate font-medium text-ink">{title}</div>
        {meta && <div className="mt-1 text-xs">{meta}</div>}
      </div>
      <div className="flex shrink-0 gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={onEdit}
          disabled={pending}
        >
          編集
        </Button>
        <Button
          size="sm"
          variant="danger"
          onClick={onDelete}
          disabled={pending}
        >
          {pending ? "削除中…" : "削除"}
        </Button>
      </div>
    </li>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <li className="px-5 py-10 text-center text-sm text-faint">{children}</li>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

/* ---------------- forms ---------------- */

function ShopForm({
  initial,
  onClose,
  onSubmit,
  pending,
}: {
  initial?: ShopRow;
  onClose: () => void;
  onSubmit: (fd: FormData) => void;
  pending: boolean;
}) {
  const initialDow = parseHoursByDow(initial?.hoursByDow);
  const [f, setF] = useState({
    name: initial?.name ?? "",
    sortNumber: initial?.sortNumber ?? 0,
    address: initial?.address ?? "",
    phone: initial?.phone ?? "",
    lineUrl: initial?.lineUrl ?? "",
    openTime: initial?.openTime ?? "",
    closeTime: initial?.closeTime ?? "",
    breakStart: initial?.breakStart ?? "",
    breakEnd: initial?.breakEnd ?? "",
  });
  const [useDow, setUseDow] = useState(Object.keys(initialDow).length > 0);
  const [dow, setDow] = useState<HoursByDow>(initialDow);
  const initialDateOv = parseDateOverrides(initial?.dateOverrides);
  const [useDateOv, setUseDateOv] = useState(
    Object.keys(initialDateOv).length > 0,
  );
  const [dateOv, setDateOv] = useState<DateOverrides>(initialDateOv);
  const setDateOverride = (date: string, override: DateOverride | null) =>
    setDateOv((prev) => {
      const next = { ...prev };
      if (override === null) delete next[date];
      else next[date] = override;
      return next;
    });
  const setDowField = (
    key: string,
    field: keyof DowOverride,
    value: string | boolean,
  ) =>
    setDow((prev) => {
      const next = { ...prev };
      const cur: DowOverride = { ...(next[key] ?? {}) };
      if (field === "closed") {
        if (value) {
          next[key] = { closed: true };
        } else {
          delete cur.closed;
          if (Object.keys(cur).length === 0) delete next[key];
          else next[key] = cur;
        }
        return next;
      }
      if (cur.closed) delete cur.closed;
      const v = typeof value === "string" ? value.trim() : "";
      if (v === "") {
        delete cur[field];
      } else {
        (cur as Record<string, unknown>)[field] = v;
      }
      if (Object.keys(cur).length === 0) delete next[key];
      else next[key] = cur;
      return next;
    });
  const submit = () => {
    const fd = new FormData();
    if (initial) fd.set("id", String(initial.id));
    Object.entries(f).forEach(([k, v]) => fd.set(k, String(v)));
    fd.set("hoursByDow", useDow ? (serializeHoursByDow(dow) ?? "") : "");
    fd.set(
      "dateOverrides",
      useDateOv ? (serializeDateOverrides(dateOv) ?? "") : "",
    );
    onSubmit(fd);
  };
  return (
    <Modal open onClose={onClose} title={initial ? "店舗を編集" : "店舗を追加"}>
      <div className="space-y-4">
        <Field label="店舗名">
          <Input
            value={f.name}
            onChange={(e) => setF({ ...f, name: e.target.value })}
            placeholder="Dreamland 銀座本店"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="表示順">
            <Input
              type="number"
              min={0}
              value={f.sortNumber}
              onChange={(e) =>
                setF({ ...f, sortNumber: Number(e.target.value) || 0 })
              }
            />
          </Field>
          <Field label="電話番号">
            <Input
              value={f.phone}
              onChange={(e) => setF({ ...f, phone: e.target.value })}
              placeholder="03-1234-5678"
            />
          </Field>
        </div>
        <Field label="住所">
          <Input
            value={f.address}
            onChange={(e) => setF({ ...f, address: e.target.value })}
          />
        </Field>
        <Field label="LINE URL">
          <Input
            value={f.lineUrl}
            onChange={(e) => setF({ ...f, lineUrl: e.target.value })}
          />
        </Field>

        <div className="rounded-xl border border-line bg-base/40 p-3">
          <p className="mb-2 text-xs font-medium text-muted">
            営業時間・休憩（予約表の表示範囲に反映。空欄で 9:00–21:00）
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="営業開始">
              <Input
                type="time"
                value={f.openTime}
                onChange={(e) => setF({ ...f, openTime: e.target.value })}
              />
            </Field>
            <Field label="営業終了">
              <Input
                type="time"
                value={f.closeTime}
                onChange={(e) => setF({ ...f, closeTime: e.target.value })}
              />
            </Field>
            <Field label="休憩開始">
              <Input
                type="time"
                value={f.breakStart}
                onChange={(e) => setF({ ...f, breakStart: e.target.value })}
              />
            </Field>
            <Field label="休憩終了">
              <Input
                type="time"
                value={f.breakEnd}
                onChange={(e) => setF({ ...f, breakEnd: e.target.value })}
              />
            </Field>
          </div>
        </div>

        <div className="rounded-xl border border-line bg-base/40 p-3">
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={useDow}
              onChange={(e) => setUseDow(e.target.checked)}
              className="accent-accent"
            />
            曜日ごとに営業時間を設定する
          </label>
          {useDow && (
            <div className="mt-3 space-y-2">
              <p className="text-[11px] text-faint">
                空欄の項目は上記のデフォルトを使用します。「休業」をチェックするとその曜日は予約不可になります。
              </p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-xs">
                  <thead>
                    <tr className="text-left text-faint">
                      <th className="px-1 py-1 font-medium">曜日</th>
                      <th className="px-1 py-1 font-medium">休業</th>
                      <th className="px-1 py-1 font-medium">開店</th>
                      <th className="px-1 py-1 font-medium">閉店</th>
                      <th className="px-1 py-1 font-medium">休憩開始</th>
                      <th className="px-1 py-1 font-medium">休憩終了</th>
                    </tr>
                  </thead>
                  <tbody>
                    {DOW_LABELS.map(({ key, label }) => {
                      const row = dow[key] ?? {};
                      const closed = row.closed === true;
                      return (
                        <tr key={key} className="border-t border-line/60">
                          <td className="px-1 py-1.5 font-medium text-ink">
                            {label}
                          </td>
                          <td className="px-1 py-1.5">
                            <input
                              type="checkbox"
                              checked={closed}
                              onChange={(e) =>
                                setDowField(key, "closed", e.target.checked)
                              }
                              className="accent-accent"
                            />
                          </td>
                          <td className="px-1 py-1.5">
                            <Input
                              type="time"
                              value={row.openTime ?? ""}
                              disabled={closed}
                              onChange={(e) =>
                                setDowField(key, "openTime", e.target.value)
                              }
                              className="h-8"
                            />
                          </td>
                          <td className="px-1 py-1.5">
                            <Input
                              type="time"
                              value={row.closeTime ?? ""}
                              disabled={closed}
                              onChange={(e) =>
                                setDowField(key, "closeTime", e.target.value)
                              }
                              className="h-8"
                            />
                          </td>
                          <td className="px-1 py-1.5">
                            <Input
                              type="time"
                              value={row.breakStart ?? ""}
                              disabled={closed}
                              onChange={(e) =>
                                setDowField(key, "breakStart", e.target.value)
                              }
                              className="h-8"
                            />
                          </td>
                          <td className="px-1 py-1.5">
                            <Input
                              type="time"
                              value={row.breakEnd ?? ""}
                              disabled={closed}
                              onChange={(e) =>
                                setDowField(key, "breakEnd", e.target.value)
                              }
                              className="h-8"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-line bg-base/40 p-3">
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={useDateOv}
              onChange={(e) => setUseDateOv(e.target.checked)}
              className="accent-accent"
            />
            休診日カレンダー（祝日・臨時休診）
          </label>
          {useDateOv && (
            <div className="mt-3">
              <DateOverridesCalendar
                overrides={dateOv}
                onSet={setDateOverride}
              />
            </div>
          )}
        </div>

        <FormFooter onClose={onClose} onSubmit={submit} pending={pending} />
      </div>
    </Modal>
  );
}

function DateOverridesCalendar({
  overrides,
  onSet,
}: {
  overrides: DateOverrides;
  onSet: (date: string, override: DateOverride | null) => void;
}) {
  const todayYmd = useMemo(() => toLocalDateString(), []);
  const [calMonth, setCalMonth] = useState(todayYmd.slice(0, 7));
  const [selected, setSelected] = useState<string | null>(null);
  const rows = useMemo(() => buildMonthCells(calMonth), [calMonth]);
  const [y, m] = calMonth.split("-").map(Number);
  const monthLabel = `${y}年${m}月`;
  const selectedOv = selected ? overrides[selected] : undefined;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setCalMonth(shiftMonth(calMonth, -1))}
          className="rounded-lg border border-line px-3 py-1 text-xs text-muted hover:border-accent/60 hover:text-accent"
        >
          ‹ 前月
        </button>
        <span className="text-sm font-medium text-ink">{monthLabel}</span>
        <button
          type="button"
          onClick={() => setCalMonth(shiftMonth(calMonth, 1))}
          className="rounded-lg border border-line px-3 py-1 text-xs text-muted hover:border-accent/60 hover:text-accent"
        >
          次月 ›
        </button>
      </div>

      <table className="w-full border-collapse text-center text-xs">
        <thead>
          <tr className="text-faint">
            {["日", "月", "火", "水", "木", "金", "土"].map((d, i) => (
              <th
                key={d}
                className={`py-1 font-medium ${
                  i === 0 ? "text-danger" : i === 6 ? "text-info" : ""
                }`}
              >
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => {
                if (!cell)
                  return <td key={ci} className="border border-line/40 p-0" />;
                const ov = overrides[cell];
                const isSelected = selected === cell;
                const isToday = cell === todayYmd;
                const dayNum = Number(cell.slice(8, 10));
                return (
                  <td
                    key={ci}
                    className="border border-line/40 p-0 align-top"
                  >
                    <button
                      type="button"
                      onClick={() => setSelected(cell)}
                      className={`flex h-12 w-full flex-col items-center justify-start gap-0.5 px-1 py-1 transition-colors ${
                        isSelected
                          ? "ring-2 ring-accent ring-inset"
                          : "hover:bg-elevated/50"
                      } ${isToday ? "bg-accent-soft/40" : ""}`}
                    >
                      <span
                        className={`text-[11px] ${
                          ci === 0
                            ? "text-danger"
                            : ci === 6
                              ? "text-info"
                              : "text-ink"
                        }`}
                      >
                        {dayNum}
                      </span>
                      {ov && (
                        <span
                          className={`rounded border px-1 text-[9px] leading-tight ${DATE_OV_BADGE[ov.type]}`}
                        >
                          {DATE_OV_LABEL[ov.type]}
                        </span>
                      )}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {selected && (
        <div className="space-y-2 rounded-lg border border-accent/30 bg-accent/5 p-3">
          <p className="text-xs font-medium text-ink">
            {formatJpDate(selected)} の設定
          </p>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["closed", "全日休"],
                ["morning", "午前休"],
                ["afternoon", "午後休"],
              ] as const
            ).map(([type, label]) => {
              const active = selectedOv?.type === type;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() =>
                    onSet(selected, { type, note: selectedOv?.note })
                  }
                  className={`rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                    active
                      ? "border-accent bg-accent text-accent-fg"
                      : "border-line text-muted hover:border-accent/60 hover:text-accent"
                  }`}
                >
                  {label}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => {
                onSet(selected, null);
              }}
              disabled={!selectedOv}
              className="rounded-lg border border-line px-3 py-1.5 text-xs text-muted hover:border-danger/40 hover:text-danger disabled:opacity-40"
            >
              通常に戻す
            </button>
          </div>
          {selectedOv && (
            <Input
              placeholder="メモ（任意、最大100文字）"
              value={selectedOv.note ?? ""}
              maxLength={100}
              onChange={(e) =>
                onSet(selected, {
                  type: selectedOv.type,
                  note: e.target.value || undefined,
                })
              }
              className="h-8 text-xs"
            />
          )}
        </div>
      )}
    </div>
  );
}

function StaffForm({
  initial,
  onClose,
  onSubmit,
  pending,
}: {
  initial?: StaffRow;
  onClose: () => void;
  onSubmit: (fd: FormData) => void;
  pending: boolean;
}) {
  const [f, setF] = useState({
    name: initial?.name ?? "",
    color: initial?.color ?? "#6f9bd8",
    allocateOrder: initial?.allocateOrder ?? 0,
    isBookable: initial?.isBookable ?? true,
    spotMode: initial?.spotMode ?? false,
  });
  const [workDates, setWorkDates] = useState<string[]>(
    parseWorkDates(initial?.workDates),
  );
  const toggleWorkDate = (date: string) =>
    setWorkDates((prev) =>
      prev.includes(date)
        ? prev.filter((d) => d !== date)
        : [...prev, date].sort(),
    );
  const submit = () => {
    const fd = new FormData();
    if (initial) fd.set("id", String(initial.id));
    fd.set("name", f.name);
    fd.set("color", f.color);
    fd.set("allocateOrder", String(f.allocateOrder));
    fd.set("isBookable", f.isBookable ? "true" : "false");
    fd.set("spotMode", f.spotMode ? "true" : "false");
    fd.set(
      "workDates",
      f.spotMode ? (serializeWorkDates(workDates) ?? "") : "",
    );
    onSubmit(fd);
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={initial ? "スタッフを編集" : "スタッフを追加"}
    >
      <div className="space-y-4">
        <Field label="スタッフ名">
          <Input
            value={f.name}
            onChange={(e) => setF({ ...f, name: e.target.value })}
            placeholder="佐藤 美咲"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="表示色">
            <input
              type="color"
              value={f.color}
              onChange={(e) => setF({ ...f, color: e.target.value })}
              className="h-10 w-full cursor-pointer rounded-xl border border-line bg-base"
            />
          </Field>
          <Field label="割当優先順（小さいほど優先）">
            <Input
              type="number"
              min={0}
              value={f.allocateOrder}
              onChange={(e) =>
                setF({ ...f, allocateOrder: Number(e.target.value) || 0 })
              }
            />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={f.isBookable}
            onChange={(e) => setF({ ...f, isBookable: e.target.checked })}
            className="h-4 w-4 accent-accent"
          />
          予約受付の対象にする
        </label>

        <div className="rounded-xl border border-line bg-base/40 p-3">
          <Field label="勤務形態">
            <Select
              value={f.spotMode ? "spot" : "regular"}
              onChange={(e) =>
                setF({ ...f, spotMode: e.target.value === "spot" })
              }
            >
              <option value="regular">常勤（毎日 営業時間どおり）</option>
              <option value="spot">臨時／スポット（出勤日のみ）</option>
            </Select>
          </Field>
          {f.spotMode && (
            <div className="mt-3">
              <p className="mb-2 text-[11px] text-faint">
                出勤日を選択してください。選んだ日だけ予約枠が表示されます（その他の日は予約不可・ブロック不要）。
              </p>
              <WorkDatesCalendar
                workDates={workDates}
                onToggle={toggleWorkDate}
              />
            </div>
          )}
        </div>

        <FormFooter onClose={onClose} onSubmit={submit} pending={pending} />
      </div>
    </Modal>
  );
}

function WorkDatesCalendar({
  workDates,
  onToggle,
}: {
  workDates: string[];
  onToggle: (date: string) => void;
}) {
  const todayYmd = useMemo(() => toLocalDateString(), []);
  const [calMonth, setCalMonth] = useState(todayYmd.slice(0, 7));
  const rows = useMemo(() => buildMonthCells(calMonth), [calMonth]);
  const workSet = useMemo(() => new Set(workDates), [workDates]);
  const [y, m] = calMonth.split("-").map(Number);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setCalMonth(shiftMonth(calMonth, -1))}
          className="rounded-lg border border-line px-3 py-1 text-xs text-muted hover:border-accent/60 hover:text-accent"
        >
          ‹ 前月
        </button>
        <span className="text-sm font-medium text-ink">
          {y}年{m}月
        </span>
        <button
          type="button"
          onClick={() => setCalMonth(shiftMonth(calMonth, 1))}
          className="rounded-lg border border-line px-3 py-1 text-xs text-muted hover:border-accent/60 hover:text-accent"
        >
          次月 ›
        </button>
      </div>

      <table className="w-full border-collapse text-center text-xs">
        <thead>
          <tr className="text-faint">
            {["日", "月", "火", "水", "木", "金", "土"].map((d, i) => (
              <th
                key={d}
                className={`py-1 font-medium ${
                  i === 0 ? "text-danger" : i === 6 ? "text-info" : ""
                }`}
              >
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => {
                if (!cell)
                  return <td key={ci} className="border border-line/40 p-0" />;
                const on = workSet.has(cell);
                const isToday = cell === todayYmd;
                const dayNum = Number(cell.slice(8, 10));
                return (
                  <td key={ci} className="border border-line/40 p-0">
                    <button
                      type="button"
                      onClick={() => onToggle(cell)}
                      className={`flex h-9 w-full items-center justify-center text-xs transition-colors ${
                        on
                          ? "bg-accent font-semibold text-accent-fg"
                          : "hover:bg-elevated/50"
                      } ${
                        !on && isToday ? "ring-1 ring-inset ring-accent/40" : ""
                      } ${
                        ci === 0
                          ? "text-danger"
                          : ci === 6
                            ? "text-info"
                            : ""
                      }`}
                    >
                      {dayNum}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[11px] text-faint">
        選択中の出勤日: {workDates.length}日
      </p>
    </div>
  );
}

function MenuForm({
  initial,
  equipments,
  staffs,
  activeShopName,
  onClose,
  onSubmit,
  pending,
}: {
  initial?: MenuRow;
  equipments: EquipmentRow[];
  staffs: StaffRow[];
  activeShopName: string;
  onClose: () => void;
  onSubmit: (fd: FormData) => void;
  pending: boolean;
}) {
  const [f, setF] = useState({
    name: initial?.name ?? "",
    durationMin: initial?.durationMin ?? 60,
    price: initial?.price ?? 0,
    isPublic: initial?.isPublic ?? true,
    sortNumber: initial?.sortNumber ?? 0,
    brandCommon: initial ? initial.shopId == null : true,
    requiresStaff: initial?.requiresStaff ?? true,
    equipmentId: initial?.equipmentId ?? null,
    // 対応スタッフ（空 = 全員対応）。表示中の店舗のスタッフだけを扱う。
    staffIds: (initial?.staffLinks ?? [])
      .map((l) => l.staffId)
      .filter((id) => staffs.some((s) => s.id === id)),
  });
  const submit = () => {
    const fd = new FormData();
    if (initial) fd.set("id", String(initial.id));
    fd.set("name", f.name);
    fd.set("durationMin", String(f.durationMin));
    fd.set("price", String(f.price));
    fd.set("isPublic", f.isPublic ? "true" : "false");
    fd.set("sortNumber", String(f.sortNumber));
    fd.set("brandCommon", f.brandCommon ? "true" : "false");
    fd.set("requiresStaff", f.requiresStaff ? "true" : "false");
    if (f.equipmentId != null) fd.set("equipmentId", String(f.equipmentId));
    // スタッフ不要メニューに対応スタッフは無意味なので送らない。
    fd.set(
      "staffIds",
      JSON.stringify(f.requiresStaff ? f.staffIds : []),
    );
    onSubmit(fd);
  };
  const toggleStaff = (id: number, on: boolean) =>
    setF((p) => ({
      ...p,
      staffIds: on
        ? [...p.staffIds, id]
        : p.staffIds.filter((x) => x !== id),
    }));
  return (
    <Modal
      open
      onClose={onClose}
      title={initial ? "メニューを編集" : "メニューを追加"}
    >
      <div className="space-y-4">
        <Field label="メニュー名">
          <Input
            value={f.name}
            onChange={(e) => setF({ ...f, name: e.target.value })}
            placeholder="ボディケア 60分"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="施術時間（分）">
            <Input
              type="number"
              min={5}
              step={5}
              value={f.durationMin}
              onChange={(e) =>
                setF({ ...f, durationMin: Number(e.target.value) || 0 })
              }
            />
          </Field>
          <Field label="料金（円）">
            <Input
              type="number"
              min={0}
              value={f.price}
              onChange={(e) =>
                setF({ ...f, price: Number(e.target.value) || 0 })
              }
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="提供範囲">
            <Select
              value={f.brandCommon ? "1" : "0"}
              onChange={(e) =>
                setF({ ...f, brandCommon: e.target.value === "1" })
              }
            >
              <option value="1">全店舗共通</option>
              <option value="0">この店舗のみ</option>
            </Select>
          </Field>
          <Field label="表示順">
            <Input
              type="number"
              min={0}
              value={f.sortNumber}
              onChange={(e) =>
                setF({ ...f, sortNumber: Number(e.target.value) || 0 })
              }
            />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={f.isPublic}
            onChange={(e) => setF({ ...f, isPublic: e.target.checked })}
            className="h-4 w-4 accent-accent"
          />
          オンライン予約ページに公開する
        </label>

        <div className="rounded-xl border border-line bg-base/40 p-3">
          <p className="mb-2 text-xs font-medium text-muted">使うリソース</p>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={f.requiresStaff}
              onChange={(e) =>
                setF({ ...f, requiresStaff: e.target.checked })
              }
              className="h-4 w-4 accent-accent"
            />
            スタッフが必要（外すと「機械単独」メニューになります）
          </label>
          <div className="mt-3">
            <Field label="使う設備（任意）">
              <Select
                value={f.equipmentId == null ? "" : String(f.equipmentId)}
                onChange={(e) =>
                  setF({
                    ...f,
                    equipmentId:
                      e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              >
                <option value="">なし</option>
                {equipments.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </Select>
            </Field>
            <p className="mt-1 text-[11px] text-faint">
              設備を選ぶと、予約時にその設備の空き状況も自動でチェックされます。スタッフ不要+設備指定で「楽トレ」「水素吸引」などの機械単独メニューになります。
            </p>
          </div>
        </div>

        {f.requiresStaff && (
          <div className="rounded-xl border border-line bg-base/40 p-3">
            <p className="mb-1 text-xs font-medium text-muted">
              対応スタッフ（{activeShopName}）
            </p>
            <p className="mb-2 text-[11px] text-faint">
              誰も選ばなければ全員が対応できます。選ぶと、オンライン予約では
              その人の空き時間だけが「◎」になり、指名なしでもその人にしか
              割り当てられません。全店舗共通メニューでも、対応スタッフは
              店舗ごとに設定します。
            </p>
            {staffs.length === 0 ? (
              <p className="text-xs text-faint">
                この店舗にはスタッフが登録されていません
              </p>
            ) : (
              <div className="grid gap-1.5 sm:grid-cols-2">
                {staffs.map((s) => (
                  <label
                    key={s.id}
                    className="flex items-center gap-2 text-sm text-ink"
                  >
                    <input
                      type="checkbox"
                      checked={f.staffIds.includes(s.id)}
                      onChange={(e) => toggleStaff(s.id, e.target.checked)}
                      className="h-4 w-4 shrink-0 accent-accent"
                    />
                    <span
                      className="inline-block h-3 w-3 shrink-0 rounded-full ring-1 ring-line"
                      style={{ background: s.color }}
                    />
                    <span className="truncate">{s.name}</span>
                  </label>
                ))}
              </div>
            )}
            <p className="mt-2 text-[11px] font-medium text-muted">
              {f.staffIds.length === 0
                ? "現在: 全員が対応できます"
                : `現在: ${staffs
                    .filter((s) => f.staffIds.includes(s.id))
                    .map((s) => s.name)
                    .join("・")} のみ対応`}
            </p>
          </div>
        )}

        <FormFooter onClose={onClose} onSubmit={submit} pending={pending} />
      </div>
    </Modal>
  );
}

function EquipmentForm({
  initial,
  onClose,
  onSubmit,
  pending,
}: {
  initial?: EquipmentRow;
  onClose: () => void;
  onSubmit: (fd: FormData) => void;
  pending: boolean;
}) {
  const [f, setF] = useState({
    name: initial?.name ?? "",
    color: initial?.color ?? "#a9803f",
    sortNumber: initial?.sortNumber ?? 0,
    isBookable: initial?.isBookable ?? true,
  });
  const submit = () => {
    const fd = new FormData();
    if (initial) fd.set("id", String(initial.id));
    fd.set("name", f.name);
    fd.set("color", f.color);
    fd.set("sortNumber", String(f.sortNumber));
    fd.set("isBookable", f.isBookable ? "true" : "false");
    onSubmit(fd);
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={initial ? "設備を編集" : "設備を追加"}
    >
      <div className="space-y-4">
        <Field label="設備名">
          <Input
            value={f.name}
            onChange={(e) => setF({ ...f, name: e.target.value })}
            placeholder="楽トレ"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="表示色">
            <input
              type="color"
              value={f.color}
              onChange={(e) => setF({ ...f, color: e.target.value })}
              className="h-10 w-full cursor-pointer rounded-xl border border-line bg-base"
            />
          </Field>
          <Field label="表示順">
            <Input
              type="number"
              min={0}
              value={f.sortNumber}
              onChange={(e) =>
                setF({ ...f, sortNumber: Number(e.target.value) || 0 })
              }
            />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={f.isBookable}
            onChange={(e) => setF({ ...f, isBookable: e.target.checked })}
            className="h-4 w-4 accent-accent"
          />
          予約可能（外すと一時的に使えなくなります）
        </label>
        <FormFooter onClose={onClose} onSubmit={submit} pending={pending} />
      </div>
    </Modal>
  );
}

function CardColorPresetForm({
  initial,
  onClose,
  onSubmit,
  pending,
}: {
  initial?: CardColorPresetRow;
  onClose: () => void;
  onSubmit: (fd: FormData) => void;
  pending: boolean;
}) {
  const [f, setF] = useState({
    name: initial?.name ?? "",
    hexColor: initial?.hexColor ?? "#d8b06a",
    sortNumber: initial?.sortNumber ?? 0,
  });
  const submit = () => {
    const fd = new FormData();
    if (initial) fd.set("id", String(initial.id));
    fd.set("name", f.name);
    fd.set("hexColor", f.hexColor);
    fd.set("sortNumber", String(f.sortNumber));
    onSubmit(fd);
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={initial ? "色プリセットを編集" : "色プリセットを追加"}
    >
      <div className="space-y-4">
        <Field label="名前">
          <Input
            value={f.name}
            onChange={(e) => setF({ ...f, name: e.target.value })}
            placeholder="新規さん / VIP / 要相談 など"
            maxLength={40}
          />
        </Field>
        <Field label="色">
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={f.hexColor}
              onChange={(e) => setF({ ...f, hexColor: e.target.value })}
              className="h-9 w-12 shrink-0 cursor-pointer rounded-lg border border-line bg-base p-1"
              aria-label="プリセットの色"
            />
            <span className="text-sm tabular-nums text-muted">{f.hexColor}</span>
          </div>
        </Field>
        <Field label="表示順">
          <Input
            type="number"
            min={0}
            value={f.sortNumber}
            onChange={(e) =>
              setF({ ...f, sortNumber: Number(e.target.value) || 0 })
            }
          />
        </Field>
        <p className="text-[11px] text-faint">
          保存した色は予約モーダルからもチップとして再利用できます。
          色を後から変更しても、過去の予約の色は変わりません（色をコピーする運用）。
        </p>
        <FormFooter onClose={onClose} onSubmit={submit} pending={pending} />
      </div>
    </Modal>
  );
}

function VisitSourceForm({
  initial,
  onClose,
  onSubmit,
  pending,
}: {
  initial?: VisitSourceRow;
  onClose: () => void;
  onSubmit: (fd: FormData) => void;
  pending: boolean;
}) {
  const [f, setF] = useState({
    name: initial?.name ?? "",
    sortNumber: initial?.sortNumber ?? 0,
  });
  const submit = () => {
    const fd = new FormData();
    if (initial) fd.set("id", String(initial.id));
    fd.set("name", f.name);
    fd.set("sortNumber", String(f.sortNumber));
    onSubmit(fd);
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={initial ? "来店経路を編集" : "来店経路を追加"}
    >
      <div className="space-y-4">
        <Field label="経路名">
          <Input
            value={f.name}
            onChange={(e) => setF({ ...f, name: e.target.value })}
            placeholder="紹介 / meta / チラシ / HP"
          />
        </Field>
        <Field label="表示順">
          <Input
            type="number"
            min={0}
            value={f.sortNumber}
            onChange={(e) =>
              setF({ ...f, sortNumber: Number(e.target.value) || 0 })
            }
          />
        </Field>
        <FormFooter onClose={onClose} onSubmit={submit} pending={pending} />
      </div>
    </Modal>
  );
}

function FormFooter({
  onClose,
  onSubmit,
  pending,
}: {
  onClose: () => void;
  onSubmit: () => void;
  pending: boolean;
}) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <Button variant="ghost" size="sm" onClick={onClose} disabled={pending}>
        キャンセル
      </Button>
      <Button size="sm" onClick={onSubmit} disabled={pending}>
        {pending ? "保存中…" : "保存"}
      </Button>
    </div>
  );
}
