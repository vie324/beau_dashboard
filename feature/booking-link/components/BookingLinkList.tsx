"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { BookingLinkForm } from "@/feature/booking-link/components/BookingLinkForm";
import {
  toggleBookingLink,
  deleteBookingLink,
} from "@/feature/booking-link/actions/bookingLinkActions";
import type { BookingLinkRow } from "@/feature/booking-link/services/getBookingLinks";
import {
  SCHEDULE_MODE_LABEL,
  describeSchedule,
  isUnrestricted,
  type LinkSchedule,
  type ScheduleState,
} from "@/feature/booking-link/lib/schedule";

const STATE_BADGE: Record<
  Exclude<ScheduleState, "open">,
  { label: string; className: string }
> = {
  before: { label: "受付開始前", className: "border-info/30 bg-info/10 text-info" },
  after: { label: "受付終了", className: "border-line bg-base text-faint" },
  ended: { label: "受付終了", className: "border-line bg-base text-faint" },
  full: { label: "満員", className: "border-warn/40 bg-warn/10 text-warn" },
};

/** このリンクで受け付けられる件数の目安（先着の上限 / 枠限定は 枠数 × 1枠の件数）。 */
function bookingCapacity(s: LinkSchedule): number | null {
  const bySlots =
    s.mode === "slots" && s.slotCapacity != null
      ? s.slots.length * s.slotCapacity
      : null;
  if (s.maxBookings != null && bySlots != null) {
    return Math.min(s.maxBookings, bySlots);
  }
  return s.maxBookings ?? bySlots;
}

export function BookingLinkList({
  links,
  shops,
  menus,
  scheduleSupported,
  today,
}: {
  links: BookingLinkRow[];
  shops: { id: number; name: string }[];
  menus: { id: number; name: string; shopId: number | null }[];
  scheduleSupported: boolean;
  /** 今日（JST）。サーバーで決めて渡す（日付の表示を SSR と揃えるため） */
  today: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      setErr(null);
      try {
        const r = await fn();
        if (!r.ok) {
          setErr(r.error ?? "操作に失敗しました");
          return;
        }
        router.refresh();
      } catch {
        setErr("操作に失敗しました。時間をおいて再度お試しください");
      }
    });
  const [modal, setModal] = useState<
    | { mode: "create" }
    | { mode: "edit"; row: BookingLinkRow }
    | { mode: "copy"; row: BookingLinkRow }
    | null
  >(null);
  const [copied, setCopied] = useState<number | null>(null);

  useEffect(() => setOrigin(window.location.origin), []);

  const copy = async (id: number, slug: string) => {
    await navigator.clipboard.writeText(`${origin}/book/${slug}`);
    setCopied(id);
    setTimeout(() => setCopied((c) => (c === id ? null : c)), 1500);
  };

  const total = links.length;
  const activeCount = links.filter((l) => l.isActive).length;

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted">
          {total > 0 ? `全${total}件・公開中 ${activeCount}件` : ""}
        </p>
        <Button size="sm" onClick={() => setModal({ mode: "create" })}>
          ＋ 新規リンク
        </Button>
      </div>

      {err && (
        <p className="mb-4 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {err}
        </p>
      )}

      {links.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-surface px-6 py-14 text-center">
          <p className="text-sm font-medium text-ink">予約リンクがありません</p>
          <p className="mt-1 text-xs text-faint">
            「＋ 新規リンク」から、公開予約ページを作成してください。
          </p>
        </div>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {links.map((l) => {
            const capacity = bookingCapacity(l.schedule);
            const stateBadge = l.state === "open" ? null : STATE_BADGE[l.state];
            const restricted = !isUnrestricted(l.schedule);
            return (
              <li
                key={l.id}
                className={`flex flex-col rounded-2xl border bg-surface shadow-panel transition-colors ${
                  l.isActive ? "border-line" : "border-line/70 opacity-80"
                }`}
              >
                <div className="flex items-start gap-3 px-5 pt-5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <h3 className="truncate text-[15px] font-semibold text-ink">
                        {l.name}
                      </h3>
                      {l.isActive && stateBadge && (
                        <Badge className={stateBadge.className}>
                          {stateBadge.label}
                        </Badge>
                      )}
                    </div>
                    {l.description && (
                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-faint">
                        {l.description}
                      </p>
                    )}
                  </div>
                  <button
                    disabled={pending}
                    title={l.isActive ? "押すと公開を停止します" : "押すと公開します"}
                    className="shrink-0 disabled:opacity-50"
                    onClick={() => run(() => toggleBookingLink(l.id, !l.isActive))}
                  >
                    {l.isActive ? (
                      <Badge className="border-ok/30 bg-ok/15 text-ok">
                        <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-ok" />
                        公開中
                      </Badge>
                    ) : (
                      <Badge className="border-line bg-base text-faint">
                        <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-faint" />
                        停止中
                      </Badge>
                    )}
                  </button>
                </div>

                <div className="mx-5 mt-3 flex items-center gap-2 rounded-xl border border-line/70 bg-base/60 px-3 py-2">
                  <code className="min-w-0 flex-1 truncate text-xs text-muted">
                    /book/{l.slug}
                  </code>
                  <button
                    onClick={() => copy(l.id, l.slug)}
                    className="shrink-0 text-xs font-medium text-accent-hover hover:text-ink"
                  >
                    {copied === l.id ? "コピー済 ✓" : "コピー"}
                  </button>
                  <a
                    href={`/book/${l.slug}`}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 text-xs text-muted hover:text-ink"
                  >
                    開く ↗
                  </a>
                </div>

                <dl className="grid flex-1 grid-cols-[auto_1fr] gap-x-4 gap-y-2 px-5 py-4 text-xs">
                  <dt className="text-faint">対象</dt>
                  <dd>
                    {l.shopName ? (
                      <Badge className="border-info/30 bg-info/10 text-info">
                        {l.shopName}
                      </Badge>
                    ) : (
                      <span className="text-muted">ブランド共通</span>
                    )}
                  </dd>
                  <dt className="text-faint">受付する日時</dt>
                  <dd className="min-w-0">
                    {restricted ? (
                      <div className="space-y-1">
                        <Badge className="border-accent/40 bg-accent/10 text-accent-hover">
                          {SCHEDULE_MODE_LABEL[l.schedule.mode]}
                        </Badge>
                        <ul className="space-y-0.5 text-muted">
                          {describeSchedule(l.schedule, today).map((line) => (
                            <li key={line}>{line}</li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <span className="text-muted">営業日はいつでも</span>
                    )}
                  </dd>
                  <dt className="text-faint">予約</dt>
                  <dd className="text-muted">
                    <span className="font-semibold tabular-nums text-ink">{l.bookedCount}</span>件
                    {capacity != null && ` / ${capacity}件`}
                  </dd>
                  <dt className="text-faint">リマインド</dt>
                  <dd className="text-muted">
                    {l.reminderEnabled ? `${l.reminderHoursBefore}時間前` : "—"}
                  </dd>
                </dl>

                <div className="flex justify-end gap-2 border-t border-line/70 px-5 py-3">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setModal({ mode: "edit", row: l })}
                  >
                    編集
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setModal({ mode: "copy", row: l })}
                  >
                    複製
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={pending}
                    onClick={() => {
                      if (!confirm(`「${l.name}」を削除しますか？`)) return;
                      run(() => deleteBookingLink(l.id));
                    }}
                  >
                    削除
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {modal && (
        <BookingLinkForm
          open
          onClose={() => setModal(null)}
          shops={shops}
          menus={menus}
          initial={modal.mode === "create" ? null : modal.row}
          duplicate={modal.mode === "copy"}
          scheduleSupported={scheduleSupported}
        />
      )}
    </>
  );
}
