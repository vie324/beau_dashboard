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

export function BookingLinkList({
  links,
  shops,
  menus,
}: {
  links: BookingLinkRow[];
  shops: { id: number; name: string }[];
  menus: { id: number; name: string }[];
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
    { mode: "create" } | { mode: "edit"; row: BookingLinkRow } | null
  >(null);
  const [copied, setCopied] = useState<number | null>(null);

  useEffect(() => setOrigin(window.location.origin), []);

  const copy = async (id: number, slug: string) => {
    await navigator.clipboard.writeText(`${origin}/book/${slug}`);
    setCopied(id);
    setTimeout(() => setCopied((c) => (c === id ? null : c)), 1500);
  };

  return (
    <>
      <div className="mb-5 flex justify-end">
        <Button size="sm" onClick={() => setModal({ mode: "create" })}>
          ＋ 新規リンク
        </Button>
      </div>

      {err && (
        <p className="mb-4 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {err}
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-line bg-surface shadow-panel">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-faint">
              <th className="px-4 py-3 font-medium">リンク名</th>
              <th className="px-4 py-3 font-medium">公開URL</th>
              <th className="px-4 py-3 font-medium">対象</th>
              <th className="px-4 py-3 font-medium">状態</th>
              <th className="px-4 py-3 font-medium">リマインド</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {links.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-faint">
                  強制リンクがありません。「新規リンク」から作成してください。
                </td>
              </tr>
            )}
            {links.map((l) => (
              <tr
                key={l.id}
                className="border-b border-line/70 last:border-b-0 hover:bg-elevated/40"
              >
                <td className="px-4 py-3">
                  <div className="font-medium text-ink">{l.name}</div>
                  {l.description && (
                    <div className="mt-0.5 max-w-xs truncate text-xs text-faint">
                      {l.description}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <code className="rounded bg-base px-2 py-1 text-xs text-muted">
                      /book/{l.slug}
                    </code>
                    <button
                      onClick={() => copy(l.id, l.slug)}
                      className="text-xs text-accent hover:text-accent-hover"
                    >
                      {copied === l.id ? "コピー済" : "コピー"}
                    </button>
                    <a
                      href={`/book/${l.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-muted hover:text-ink"
                    >
                      開く ↗
                    </a>
                  </div>
                </td>
                <td className="px-4 py-3 text-muted">
                  {l.shopName ? (
                    <Badge className="border-info/30 bg-info/10 text-info">
                      {l.shopName}
                    </Badge>
                  ) : (
                    <Badge className="border-line bg-base text-muted">
                      ブランド共通
                    </Badge>
                  )}
                </td>
                <td className="px-4 py-3">
                  <button
                    disabled={pending}
                    className="disabled:opacity-50"
                    onClick={() =>
                      run(() => toggleBookingLink(l.id, !l.isActive))
                    }
                  >
                    {l.isActive ? (
                      <Badge className="border-ok/30 bg-ok/15 text-ok">
                        公開中
                      </Badge>
                    ) : (
                      <Badge className="border-line bg-base text-faint">
                        停止中
                      </Badge>
                    )}
                  </button>
                </td>
                <td className="px-4 py-3 text-xs text-muted">
                  {l.reminderEnabled
                    ? `${l.reminderHoursBefore}時間前`
                    : "—"}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setModal({ mode: "edit", row: l })}
                    >
                      編集
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
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <BookingLinkForm
          open
          onClose={() => setModal(null)}
          shops={shops}
          menus={menus}
          initial={modal.mode === "edit" ? modal.row : null}
        />
      )}
    </>
  );
}
