"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/helper/utils/cn";
import {
  fetchNotifications,
  markNotificationsRead,
} from "@/feature/notification/actions/notificationActions";
import type {
  NotificationFeed,
  NotificationRow,
} from "@/feature/notification/services/getNotifications";

/** ポーリング間隔。タブが非表示のあいだは止める。 */
const POLL_MS = 30_000;

const TZ = "Asia/Tokyo";

/** 通知が作られた時刻を「たった今 / 12分前 / 9/17 14:03」で表す。 */
function timeAgo(iso: string, now: number): string {
  const t = new Date(iso).getTime();
  const diffMin = Math.floor((now - t) / 60_000);
  if (diffMin < 1) return "たった今";
  if (diffMin < 60) return `${diffMin}分前`;
  if (diffMin < 24 * 60) return `${Math.floor(diffMin / 60)}時間前`;
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: TZ,
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(t));
}

/** 予約日の "YYYY-MM-DD"（JST）。予約表へ飛ぶリンクに使う。 */
function jstDate(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

export function NotificationBell({ initial }: { initial: NotificationFeed }) {
  const router = useRouter();
  const [feed, setFeed] = useState<NotificationFeed>(initial);
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [pending, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);
  // 未読が増えたときだけベルを弾ませる / 予約表を更新する。
  const prevUnread = useRef(initial.unread);

  const load = useCallback(
    async (opts?: { refreshOnNew?: boolean }) => {
      const res = await fetchNotifications();
      if (!res.ok) return;
      setFeed({ items: res.items, unread: res.unread });
      setNow(Date.now());
      if (opts?.refreshOnNew && res.unread > prevUnread.current) {
        // 新しい予約・キャンセルが入ったので予約表も最新にする。
        router.refresh();
      }
      prevUnread.current = res.unread;
    },
    [router],
  );

  // サーバ側の再描画（予約の保存・キャンセル後の router.refresh、ページ遷移、
  // 店舗の切り替え）で届いた最新値を取り込む。これが無いと自分の操作で増えた
  // 通知がポーリング（最大30秒）まで反映されない。
  useEffect(() => {
    setFeed(initial);
    prevUnread.current = initial.unread;
    setNow(Date.now());
  }, [initial]);

  // 30秒ごとのポーリング。タブに戻ってきたときは即座に取り直す。
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer) return;
      timer = setInterval(() => void load({ refreshOnNew: true }), POLL_MS);
    };
    const stop = () => {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void load({ refreshOnNew: true });
        start();
      } else {
        stop();
      }
    };
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [load]);

  // 外側クリック / Esc で閉じる。
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) {
      setNow(Date.now());
      void load();
    }
  };

  const markAll = () =>
    startTransition(async () => {
      await markNotificationsRead();
      prevUnread.current = 0;
      setFeed((f) => ({
        items: f.items.map((i) => ({ ...i, read: true })),
        unread: 0,
      }));
    });

  const openRow = (row: NotificationRow) => {
    setOpen(false);
    startTransition(async () => {
      if (!row.read) {
        await markNotificationsRead(row.id);
        prevUnread.current = Math.max(0, prevUnread.current - 1);
        setFeed((f) => ({
          items: f.items.map((i) =>
            i.id === row.id ? { ...i, read: true } : i,
          ),
          unread: Math.max(0, f.unread - 1),
        }));
      }
      if (row.startAt) router.push(`/reservation?date=${jstDate(row.startAt)}`);
      router.refresh();
    });
  };

  const unread = feed.unread;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label={unread > 0 ? `通知 ${unread}件` : "通知"}
        aria-expanded={open}
        className={cn(
          "relative rounded-xl border border-line p-2 text-muted transition-colors hover:border-accent/60 hover:text-accent",
          open && "border-accent/60 text-accent",
        )}
      >
        <BellIcon />
        {unread > 0 && (
          <span
            key={unread}
            className="absolute -right-1.5 -top-1.5 inline-flex min-w-[18px] animate-pop items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold leading-[18px] text-white"
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {/* スマホではベルの真下に出すと画面左端をはみ出すので、画面幅に合わせた
          シートとして固定表示する。sm 以上は従来どおりベル直下のドロップダウン。 */}
      {open && (
        <div className="fixed inset-x-3 top-[3.75rem] z-50 animate-fade-in overflow-hidden rounded-xl border border-line bg-surface shadow-panel sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[22rem]">
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <span className="text-xs font-medium text-ink">
              通知{unread > 0 ? `（未読 ${unread}）` : ""}
            </span>
            <button
              type="button"
              onClick={markAll}
              disabled={pending || unread === 0}
              className="text-[11px] text-muted transition-colors hover:text-accent disabled:opacity-40"
            >
              すべて既読
            </button>
          </div>

          <ul className="max-h-[60vh] overflow-y-auto">
            {feed.items.length === 0 && (
              <li className="px-3 py-6 text-center text-xs text-faint">
                通知はまだありません
              </li>
            )}
            {feed.items.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => openRow(n)}
                  className={cn(
                    "w-full border-b border-line/70 px-3 py-2.5 text-left transition-colors last:border-b-0 hover:bg-elevated",
                    !n.read && "bg-accent-soft/50",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium leading-4",
                        n.type === "cancel"
                          ? "border-danger/30 bg-danger/10 text-danger"
                          : "border-ok/30 bg-ok/15 text-ok",
                      )}
                    >
                      {n.type === "cancel" ? "キャンセル" : "予約"}
                    </span>
                    <span className="truncate text-xs font-medium text-ink">
                      {n.title}
                    </span>
                    <span className="ml-auto shrink-0 text-[10px] text-faint">
                      {timeAgo(n.createdAt, now)}
                    </span>
                  </span>
                  <span className="mt-1 block text-[11px] leading-relaxed text-muted">
                    {n.body}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function BellIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden
    >
      <path d="M18 8a6 6 0 1 0-12 0c0 6-2 7-2 7h16s-2-1-2-7" />
      <path d="M10.3 20a2 2 0 0 0 3.4 0" />
    </svg>
  );
}
