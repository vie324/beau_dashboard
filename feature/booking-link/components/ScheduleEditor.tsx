"use client";

import { useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select } from "@/components/ui/Input";
import { MultiDateCalendar } from "@/feature/booking-link/components/MultiDateCalendar";
import {
  DOW_ORDER,
  LEAD_TIME_OPTIONS,
  MAX_SCHEDULE_SLOTS,
  SCHEDULE_MODES,
  SCHEDULE_MODE_LABEL,
  addSlots,
  describeSchedule,
  dowLabel,
  formatShortDate,
  groupSlotsByDate,
  isHhmm,
  leadTimeLabel,
  type LinkSchedule,
  type ScheduleMode,
} from "@/feature/booking-link/lib/schedule";

type EditorProps = {
  value: LinkSchedule;
  onChange: (next: LinkSchedule) => void;
  /** 今日（JST "YYYY-MM-DD"） */
  today: string;
};

const MODE_HELP: Record<ScheduleMode, string> = {
  always:
    "営業日ならいつでも予約できます（店舗の営業時間・休業日の設定に従います）。曜日や時間帯で絞り込むこともできます。",
  range:
    "指定した期間だけ予約できます（営業時間・休業日の設定に従います）。片方だけ入れると「◯日から」「◯日まで」になります。",
  dates:
    "カレンダーで選んだ日だけ予約できます。「受付する時間帯」を入れると、定休日や営業時間外でもその時間帯で受け付けます（特別営業・イベント向け）。入れなければ営業時間どおりです。",
  slots:
    "日付と開始時刻をピンポイントで指定し、その枠だけを受け付けます（例: 21日 14:15〜／16:15〜 の2枠）。営業時間外・休業日の枠も、スタッフ・設備が空いていれば受け付けます。",
};

const toggleIn = (list: string[], v: string) =>
  list.includes(v) ? list.filter((x) => x !== v) : [...list, v].sort();

/** 「予約できる日時」: モード（通常/期間限定/日付限定/枠限定）と、日付・枠・曜日・時間帯。 */
export function ScheduleDatesEditor({ value, onChange, today }: EditorProps) {
  const id = useId();
  const patch = (p: Partial<LinkSchedule>) => onChange({ ...value, ...p });

  const changeMode = (mode: ScheduleMode) => {
    if (mode === value.mode) return;
    patch({
      mode,
      // 枠限定は「1枠 = 1件」が基本（2枠限定 = 2件まで）。未設定なら1件にしておく。
      slotCapacity:
        mode === "slots" && value.slotCapacity == null ? 1 : value.slotCapacity,
    });
  };

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label="予約できる日時の決め方"
        className="grid grid-cols-2 gap-1 rounded-xl border border-line bg-base p-1 sm:grid-cols-4"
      >
        {SCHEDULE_MODES.map((m) => {
          const on = value.mode === m;
          return (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => changeMode(m)}
              className={`rounded-lg px-2 py-2 text-xs font-medium transition-colors ${
                on
                  ? "bg-surface text-ink shadow-panel ring-1 ring-accent/50"
                  : "text-muted hover:text-ink"
              }`}
            >
              {SCHEDULE_MODE_LABEL[m]}
            </button>
          );
        })}
      </div>
      <p className="text-[11px] leading-relaxed text-faint">
        {MODE_HELP[value.mode]}
      </p>

      {value.mode === "range" && (
        <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
          <div>
            <Label htmlFor={`${id}-from`}>開始日</Label>
            <Input
              id={`${id}-from`}
              type="date"
              value={value.from ?? ""}
              onChange={(e) => patch({ from: e.target.value || null })}
            />
          </div>
          <span className="pb-2.5 text-sm text-muted">〜</span>
          <div>
            <Label htmlFor={`${id}-to`}>終了日</Label>
            <Input
              id={`${id}-to`}
              type="date"
              value={value.to ?? ""}
              min={value.from ?? undefined}
              onChange={(e) => patch({ to: e.target.value || null })}
            />
          </div>
        </div>
      )}

      {value.mode === "dates" && (
        <div className="space-y-2">
          <MultiDateCalendar
            selected={value.dates}
            onToggle={(d) => patch({ dates: toggleIn(value.dates, d) })}
            today={today}
          />
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted">
              選択中（{value.dates.length}日）
            </span>
            {value.dates.map((d) => (
              <Chip
                key={d}
                muted={d < today}
                onRemove={() => patch({ dates: value.dates.filter((x) => x !== d) })}
                removeLabel={`${formatShortDate(d, today)} を外す`}
              >
                {formatShortDate(d, today)}
              </Chip>
            ))}
            {value.dates.length > 0 && (
              <button
                type="button"
                onClick={() => patch({ dates: [] })}
                className="text-[11px] text-faint underline hover:text-danger"
              >
                クリア
              </button>
            )}
          </div>
        </div>
      )}

      {value.mode === "slots" && (
        <SlotsEditor value={value} onChange={onChange} today={today} />
      )}

      {(value.mode === "always" || value.mode === "range") && (
        <div>
          <Label>曜日</Label>
          <div className="flex flex-wrap gap-1.5">
            {DOW_ORDER.map((d) => {
              const on = value.dows.includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    patch({
                      dows: on
                        ? value.dows.filter((x) => x !== d)
                        : [...value.dows, d].sort((a, b) => a - b),
                    })
                  }
                  className={`h-9 w-10 rounded-lg border text-xs font-medium transition-colors ${
                    on
                      ? "border-accent bg-accent text-accent-fg"
                      : `border-line bg-base hover:border-accent/60 ${
                          d === 0 ? "text-danger" : d === 6 ? "text-info" : "text-muted"
                        }`
                  }`}
                >
                  {dowLabel(d)}
                </button>
              );
            })}
          </div>
          <p className="mt-1 text-[11px] text-faint">
            未選択なら毎日（営業日）です
          </p>
        </div>
      )}

      {value.mode !== "slots" && (
        <div>
          <Label>受付する時間帯（開始時刻）</Label>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <Input
              type="time"
              aria-label="時間帯の始まり"
              value={value.timeFrom ?? ""}
              onChange={(e) => patch({ timeFrom: e.target.value || null })}
            />
            <span className="text-sm text-muted">〜</span>
            <Input
              type="time"
              aria-label="時間帯の終わり"
              value={value.timeTo ?? ""}
              onChange={(e) => patch({ timeTo: e.target.value || null })}
            />
          </div>
          <p className="mt-1 text-[11px] text-faint">
            {value.mode === "dates"
              ? "この時間内に始まる枠を、営業時間・休憩・休業日に関係なく受け付けます（両端を含む）。開始を1回だけにするなら両方に同じ時刻を入れます（例: 14:15〜14:15）。片方が空欄なら、その日の営業時間で補います（休業日は入れた時刻だけ）"
              : "この時間内に始まる枠だけを出します（両端を含む）。空欄なら営業時間どおりです"}
          </p>
        </div>
      )}
    </div>
  );
}

/** 枠限定: カレンダーで日付を選び、開始時刻を入れて「枠を追加」。 */
function SlotsEditor({ value, onChange, today }: EditorProps) {
  const [draftDates, setDraftDates] = useState<string[]>([]);
  const [time, setTime] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const groups = useMemo(() => groupSlotsByDate(value.slots), [value.slots]);
  const slotDates = useMemo(
    () => new Set(value.slots.map((s) => s.date)),
    [value.slots],
  );

  const add = () => {
    if (draftDates.length === 0) {
      setHint("先にカレンダーで日付を選んでください");
      return;
    }
    if (!isHhmm(time)) {
      setHint("開始時刻を入力してください");
      return;
    }
    const next = addSlots(value.slots, draftDates, [time]);
    if (next.length > MAX_SCHEDULE_SLOTS) {
      setHint(`枠は${MAX_SCHEDULE_SLOTS}件まで登録できます`);
      return;
    }
    setHint(null);
    onChange({ ...value, slots: next });
    setTime("");
  };

  const remove = (date: string, t: string) =>
    onChange({
      ...value,
      slots: value.slots.filter((s) => !(s.date === date && s.time === t)),
    });

  return (
    <div className="space-y-3">
      <div className="space-y-3 rounded-xl border border-line bg-base/40 p-3">
        <p className="text-xs font-medium text-ink">① 日付を選ぶ（複数選べます）</p>
        <MultiDateCalendar
          selected={draftDates}
          onToggle={(d) => {
            setHint(null);
            setDraftDates((prev) => toggleIn(prev, d));
          }}
          today={today}
          marked={slotDates}
          markLabel="枠を登録済みの日"
        />
        <p className="text-xs font-medium text-ink">② 開始時刻を入れて追加</p>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="time"
            aria-label="枠の開始時刻"
            value={time}
            onChange={(e) => {
              setHint(null);
              setTime(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            className="max-w-[9rem]"
          />
          <Button variant="outline" onClick={add}>
            ＋ 枠を追加
          </Button>
          {draftDates.length > 0 && (
            <button
              type="button"
              onClick={() => setDraftDates([])}
              className="text-[11px] text-faint underline hover:text-ink"
            >
              日付の選択を解除
            </button>
          )}
        </div>
        <p className="text-[11px] text-faint">
          {draftDates.length > 0
            ? `選んだ ${draftDates.length}日（${draftDates
                .slice(0, 3)
                .map((d) => formatShortDate(d, today))
                .join("・")}${draftDates.length > 3 ? " ほか" : ""}）すべてに、この時刻の枠を追加します。`
            : "時刻ごとに「枠を追加」を押します。例: 21日を選んで 14:15 → 追加、16:15 → 追加。"}
        </p>
        <p className="text-[11px] text-faint">
          終了時刻は、お客様が選ぶメニューの施術時間で決まります（例: 14:15開始・105分のメニューなら16:00終了）。
          決まった時間で終わらせたいときは、その長さのメニューを「設定 → メニュー」で作り、上の「予約可能メニュー」で選んでください。
        </p>
        {hint && <p className="text-xs text-danger">{hint}</p>}
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wider text-muted">
            登録した枠（{value.slots.length}枠）
          </span>
          {value.slots.length > 0 && (
            <button
              type="button"
              onClick={() => {
                if (confirm("登録した枠をすべて削除しますか？")) {
                  onChange({ ...value, slots: [] });
                }
              }}
              className="text-[11px] text-faint underline hover:text-danger"
            >
              すべて削除
            </button>
          )}
        </div>
        {groups.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line px-3 py-4 text-center text-xs text-faint">
            まだ枠がありません
          </p>
        ) : (
          <ul className="divide-y divide-line/70 rounded-xl border border-line bg-surface">
            {groups.map((g) => {
              const past = g.date < today;
              return (
                <li
                  key={g.date}
                  className="flex flex-wrap items-center gap-1.5 px-3 py-2"
                >
                  <span
                    className={`mr-1 w-24 shrink-0 text-xs font-medium ${
                      past ? "text-faint" : "text-ink"
                    }`}
                  >
                    {formatShortDate(g.date, today)}
                    {past && <span className="ml-1 text-[10px]">終了</span>}
                  </span>
                  {g.times.map((t) => (
                    <Chip
                      key={t}
                      muted={past}
                      onRemove={() => remove(g.date, t)}
                      removeLabel={`${formatShortDate(g.date, today)} ${t} の枠を削除`}
                    >
                      <span className="tabular-nums">{t}〜</span>
                    </Chip>
                  ))}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function Chip({
  children,
  onRemove,
  removeLabel,
  muted,
}: {
  children: React.ReactNode;
  onRemove: () => void;
  removeLabel: string;
  muted?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-xs ${
        muted
          ? "border-line bg-base text-faint"
          : "border-accent/40 bg-accent/10 text-ink"
      }`}
    >
      {children}
      <button
        type="button"
        aria-label={removeLabel}
        onClick={onRemove}
        className="-mr-0.5 px-0.5 text-faint hover:text-danger"
      >
        ✕
      </button>
    </span>
  );
}

const numberOrNull = (v: string): number | null => {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** 「定員・締切・受付期間」 */
export function ScheduleLimitsEditor({
  value,
  onChange,
}: Omit<EditorProps, "today">) {
  const id = useId();
  const patch = (p: Partial<LinkSchedule>) => onChange({ ...value, ...p });
  const leadOptions = LEAD_TIME_OPTIONS.includes(value.leadMinutes)
    ? LEAD_TIME_OPTIONS
    : [...LEAD_TIME_OPTIONS, value.leadMinutes].sort((a, b) => a - b);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor={`${id}-cap`}>1枠あたりの受付数</Label>
          <div className="flex items-center gap-2">
            <Input
              id={`${id}-cap`}
              type="number"
              inputMode="numeric"
              min={1}
              max={999}
              placeholder="制限なし"
              value={value.slotCapacity ?? ""}
              onChange={(e) => patch({ slotCapacity: numberOrNull(e.target.value) })}
              className="max-w-[7rem]"
            />
            <span className="shrink-0 text-xs text-muted">件まで</span>
          </div>
          <p className="mt-1 text-[11px] text-faint">
            同じ開始時刻に、このリンクから受け付ける件数（店舗を選べるリンクは全店舗の合計）。空欄ならスタッフの空きがある限り受け付けます
          </p>
        </div>
        <div>
          <Label htmlFor={`${id}-max`}>受付数の上限（先着）</Label>
          <div className="flex items-center gap-2">
            <Input
              id={`${id}-max`}
              type="number"
              inputMode="numeric"
              min={1}
              max={9999}
              placeholder="制限なし"
              value={value.maxBookings ?? ""}
              onChange={(e) => patch({ maxBookings: numberOrNull(e.target.value) })}
              className="max-w-[7rem]"
            />
            <span className="shrink-0 text-xs text-muted">件まで</span>
          </div>
          <p className="mt-1 text-[11px] text-faint">
            このリンクから受け付ける予約の合計。キャンセルされた分は空きに戻ります
          </p>
        </div>
      </div>

      <div>
        <Label htmlFor={`${id}-lead`}>受付締切</Label>
        <Select
          id={`${id}-lead`}
          value={value.leadMinutes}
          onChange={(e) => patch({ leadMinutes: Number(e.target.value) })}
          className="sm:w-64"
        >
          {leadOptions.map((m) => (
            <option key={m} value={m}>
              {leadTimeLabel(m)}
            </option>
          ))}
        </Select>
      </div>

      <div>
        <Label>受付期間（このリンクで予約できる期間）</Label>
        <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
          <Input
            type="datetime-local"
            aria-label="受付開始"
            value={value.openAt ?? ""}
            onChange={(e) => patch({ openAt: e.target.value ? e.target.value.slice(0, 16) : null })}
          />
          <span className="hidden text-sm text-muted sm:block">〜</span>
          <Input
            type="datetime-local"
            aria-label="受付終了"
            value={value.closeAt ?? ""}
            min={value.openAt ?? undefined}
            onChange={(e) => patch({ closeAt: e.target.value ? e.target.value.slice(0, 16) : null })}
          />
        </div>
        <p className="mt-1 text-[11px] text-faint">
          空欄なら公開中はいつでも。期間外のお客様には「受付開始前です」「受付は終了しました」と表示します
        </p>
      </div>
    </div>
  );
}

/** 設定内容のまとめ（保存前の確認用）。 */
export function ScheduleSummary({
  value,
  today,
}: {
  value: LinkSchedule;
  today: string;
}) {
  return (
    <div className="rounded-xl border border-accent/30 bg-accent/5 px-3 py-2.5">
      <p className="text-[11px] font-medium text-muted">設定内容</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        <span className="rounded-md bg-accent px-2 py-0.5 text-[11px] font-semibold text-accent-fg">
          {SCHEDULE_MODE_LABEL[value.mode]}
        </span>
        {describeSchedule(value, today).map((line) => (
          <span
            key={line}
            className="rounded-md border border-line bg-surface px-2 py-0.5 text-[11px] text-ink"
          >
            {line}
          </span>
        ))}
      </div>
    </div>
  );
}
