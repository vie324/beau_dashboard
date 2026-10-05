"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select, Textarea } from "@/components/ui/Input";
import { saveBookingLink } from "@/feature/booking-link/actions/bookingLinkActions";
import { bookingLinkSchema } from "@/feature/booking-link/schema/bookingLinkSchema";
import type { BookingLinkRow } from "@/feature/booking-link/services/getBookingLinks";
import {
  ScheduleDatesEditor,
  ScheduleLimitsEditor,
  ScheduleSummary,
} from "@/feature/booking-link/components/ScheduleEditor";
import { emptySchedule } from "@/feature/booking-link/lib/schedule";
import { toLocalDateString } from "@/helper/utils/time";

/** 複製時の slug 案（"<元>-copy"。50文字・末尾英数字の制約に収める）。 */
function copySlug(slug: string): string {
  return `${slug.slice(0, 45).replace(/-+$/, "")}-copy`;
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3 border-t border-line pt-5 first:border-t-0 first:pt-0">
      <div>
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        {description && (
          <p className="mt-0.5 text-[11px] text-faint">{description}</p>
        )}
      </div>
      {children}
    </section>
  );
}

export function BookingLinkForm({
  open,
  onClose,
  shops,
  menus,
  initial,
  duplicate = false,
  scheduleSupported,
}: {
  open: boolean;
  onClose: () => void;
  shops: { id: number; name: string }[];
  menus: { id: number; name: string }[];
  initial?: BookingLinkRow | null;
  /** true = initial の内容を元に新しいリンクを作る（複製） */
  duplicate?: boolean;
  /** 受付日時の制限（BookingLink.schedule）の DDL が適用済みか */
  scheduleSupported: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const today = useMemo(() => toLocalDateString(), []);
  const editingId = initial && !duplicate ? initial.id : null;

  const [form, setForm] = useState({
    slug: initial ? (duplicate ? copySlug(initial.slug) : initial.slug) : "",
    name: initial
      ? duplicate
        ? `${initial.name}（コピー）`.slice(0, 80)
        : initial.name
      : "",
    description: initial?.description ?? "",
    shopId: initial?.shopId ?? "",
    isActive: initial?.isActive ?? true,
    requireStaffSelection: initial?.requireStaffSelection ?? false,
    allowOverflowAtBreak: initial?.allowOverflowAtBreak ?? true,
    allowOverflowAtClose: initial?.allowOverflowAtClose ?? true,
    intervalMin: initial?.intervalMin ?? 30,
    allowedMenuIds: initial?.allowedMenuIds ?? ([] as number[]),
    reminderEnabled: initial?.reminderEnabled ?? false,
    reminderHoursBefore: initial?.reminderHoursBefore ?? 24,
    schedule: initial?.schedule ?? emptySchedule(),
  });

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const toggleMenu = (id: number) =>
    setForm((f) => ({
      ...f,
      allowedMenuIds: f.allowedMenuIds.includes(id)
        ? f.allowedMenuIds.filter((x) => x !== id)
        : [...f.allowedMenuIds, id],
    }));

  const slotMode = form.schedule.mode === "slots";

  function submit() {
    setError(null);
    const payload = {
      ...(editingId ? { id: editingId } : {}),
      slug: form.slug,
      name: form.name,
      description: form.description || undefined,
      shopId: form.shopId === "" ? undefined : Number(form.shopId),
      isActive: form.isActive,
      requireStaffSelection: form.requireStaffSelection,
      allowOverflowAtBreak: form.allowOverflowAtBreak,
      allowOverflowAtClose: form.allowOverflowAtClose,
      intervalMin: form.intervalMin,
      allowedMenuIds: form.allowedMenuIds,
      reminderEnabled: form.reminderEnabled,
      reminderHoursBefore: form.reminderHoursBefore,
      // DDL 未適用のあいだは送らない（サーバー側は「変更しない」として扱う）
      ...(scheduleSupported ? { schedule: form.schedule } : {}),
    };

    const parsed = bookingLinkSchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "入力内容を確認してください");
      return;
    }

    const fd = new FormData();
    if (editingId) fd.set("id", String(editingId));
    fd.set("slug", parsed.data.slug);
    fd.set("name", form.name);
    fd.set("description", form.description);
    if (form.shopId !== "") fd.set("shopId", String(form.shopId));
    fd.set("isActive", String(form.isActive));
    fd.set("requireStaffSelection", String(form.requireStaffSelection));
    fd.set("allowOverflowAtBreak", String(form.allowOverflowAtBreak));
    fd.set("allowOverflowAtClose", String(form.allowOverflowAtClose));
    fd.set("intervalMin", String(form.intervalMin));
    fd.set("allowedMenuIds", JSON.stringify(form.allowedMenuIds));
    fd.set("reminderEnabled", String(form.reminderEnabled));
    fd.set("reminderHoursBefore", String(form.reminderHoursBefore));
    if (parsed.data.schedule) {
      fd.set("schedule", JSON.stringify(parsed.data.schedule));
    }

    startTransition(async () => {
      const res = await saveBookingLink(null, fd);
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
      title={
        editingId
          ? "予約リンクの編集"
          : duplicate
            ? "予約リンクを複製"
            : "新規 予約リンク"
      }
      size="lg"
      footer={
        <div className="space-y-2">
          {error && (
            <p className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              disabled={pending}
            >
              キャンセル
            </Button>
            <Button size="sm" onClick={submit} disabled={pending}>
              {pending ? "保存中…" : "保存"}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        <Section title="基本">
          {duplicate && (
            <p className="rounded-xl border border-info/30 bg-info/10 px-3 py-2 text-xs text-info">
              「{initial?.name}」の設定をコピーしました。slug（URL）と受付する日時を確認して保存してください。
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>リンク名</Label>
              <Input
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="公式予約ページ"
              />
            </div>
            <div>
              <Label>slug（URL）</Label>
              <Input
                value={form.slug}
                onChange={(e) => set("slug", e.target.value)}
                placeholder="dreamland"
              />
            </div>
          </div>

          <p className="text-[11px] text-faint">
            公開URL: <span className="text-muted">/book/{form.slug || "…"}</span>
          </p>

          <div>
            <Label>説明</Label>
            <Textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="予約ページに表示する案内文"
            />
          </div>

          <div>
            <Label>対象店舗</Label>
            <Select
              value={form.shopId}
              onChange={(e) => set("shopId", e.target.value)}
            >
              <option value="">ブランド共通（来店者が店舗を選択）</option>
              {shops.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} 限定
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label>予約可能メニュー</Label>
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-xl border border-line bg-base p-3">
              {menus.length === 0 && (
                <p className="text-xs text-faint">メニューがありません</p>
              )}
              {menus.map((m) => (
                <label
                  key={m.id}
                  className="flex cursor-pointer items-center gap-2 text-sm text-ink"
                >
                  <input
                    type="checkbox"
                    checked={form.allowedMenuIds.includes(m.id)}
                    onChange={() => toggleMenu(m.id)}
                    className="accent-accent"
                  />
                  {m.name}
                </label>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-faint">
              未選択の場合は公開メニューすべてが予約可能になります
            </p>
          </div>
        </Section>

        <Section
          title="予約できる日時"
          description="日付限定・期間限定・枠限定のフォームにできます"
        >
          {!scheduleSupported && (
            <p className="rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
              日付・期間・枠の制限は、データベースの更新（prisma/manual-migrations.sql
              の適用）が済むと使えるようになります。それまでは営業日いつでも予約できるリンクとして動きます。
            </p>
          )}
          <fieldset
            disabled={!scheduleSupported}
            className="space-y-4 disabled:opacity-50"
          >
            <ScheduleDatesEditor
              value={form.schedule}
              onChange={(s) => set("schedule", s)}
              today={today}
            />
          </fieldset>

          {slotMode ? (
            <p className="text-[11px] text-faint">
              ※ 枠限定では「予約枠の時間間隔」「最終受付の挙動」は使いません（指定した枠をそのまま受け付けます）。
            </p>
          ) : (
            <>
              <div>
                <Label>予約枠の時間間隔</Label>
                <Select
                  value={form.intervalMin}
                  onChange={(e) => set("intervalMin", Number(e.target.value))}
                >
                  <option value={15}>15分単位</option>
                  <option value={30}>30分単位</option>
                  <option value={60}>60分単位</option>
                </Select>
                <p className="mt-1 text-[11px] text-faint">
                  予約ページのカレンダーに表示する開始時刻の刻みです
                </p>
              </div>

              <div className="space-y-2 rounded-xl border border-line bg-base p-3">
                <p className="text-xs font-medium text-muted">最終受付の挙動</p>
                <label className="flex items-start gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    checked={form.allowOverflowAtBreak}
                    onChange={(e) =>
                      set("allowOverflowAtBreak", e.target.checked)
                    }
                    className="mt-0.5 accent-accent"
                  />
                  <span>
                    休憩時間にまたがる予約を許可する
                    <span className="ml-1 block text-[11px] text-faint">
                      施術が休憩開始時刻を越えても開始時刻が休憩前なら予約可
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    checked={form.allowOverflowAtClose}
                    onChange={(e) =>
                      set("allowOverflowAtClose", e.target.checked)
                    }
                    className="mt-0.5 accent-accent"
                  />
                  <span>
                    営業終了時刻をまたぐ予約を許可する
                    <span className="ml-1 block text-[11px] text-faint">
                      施術が閉店時刻を越えても開始時刻が営業時間内なら予約可
                    </span>
                  </span>
                </label>
                <p className="text-[11px] text-faint">
                  時間ブロック（スタッフの昼休み等）は常に予約不可です。
                </p>
              </div>
            </>
          )}
        </Section>

        <Section
          title="定員・締切・受付期間"
          description="空欄・未設定の項目は制限なしです"
        >
          <fieldset
            disabled={!scheduleSupported}
            className="space-y-4 disabled:opacity-50"
          >
            <ScheduleLimitsEditor
              value={form.schedule}
              onChange={(s) => set("schedule", s)}
            />
            <ScheduleSummary value={form.schedule} today={today} />
          </fieldset>
        </Section>

        <Section title="公開・その他">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => set("isActive", e.target.checked)}
                className="accent-accent"
              />
              公開する
            </label>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={form.requireStaffSelection}
                onChange={(e) =>
                  set("requireStaffSelection", e.target.checked)
                }
                className="accent-accent"
              />
              スタッフ指名を必須にする
            </label>
          </div>

          <div className="rounded-xl border border-line bg-base p-3">
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={form.reminderEnabled}
                onChange={(e) => set("reminderEnabled", e.target.checked)}
                className="accent-accent"
              />
              リマインド送信を有効にする
            </label>
            {form.reminderEnabled && (
              <div className="mt-3 flex items-center gap-2">
                <span className="text-xs text-muted">予約の</span>
                <Input
                  type="number"
                  min={1}
                  max={168}
                  value={form.reminderHoursBefore}
                  onChange={(e) =>
                    set("reminderHoursBefore", Number(e.target.value))
                  }
                  className="h-8 w-20"
                />
                <span className="text-xs text-muted">時間前に送信</span>
              </div>
            )}
          </div>
        </Section>
      </div>
    </Modal>
  );
}
