"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { findCustomerAppointmentsByCode } from "@/feature/reservation/actions/reservationActions";
import { STATUS_OPTIONS } from "@/helper/utils/status";

type FoundCustomer = {
  id: number;
  code: string | null;
  name: string;
  kana: string | null;
  phone: string | null;
  appointments: {
    id: number;
    date: string;
    startAt: Date | string;
    endAt: Date | string;
    status: number;
    menuName: string | null;
    staffName: string | null;
  }[];
};

const dateLabelFmt = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
});
const timeLabelFmt = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  hour: "2-digit",
  minute: "2-digit",
});

function statusLabel(s: number): string {
  return STATUS_OPTIONS.find((o) => o.value === s)?.label ?? `状態${s}`;
}

/**
 * 患者番号（顧客 code）でその人の予約一覧を検索し、選んだ日付の予約ボードに
 * ジャンプするための小型ウィジェット。予約管理ヘッダーに常駐させる。
 *
 *   - 入力 → Enter または「検索」で server action を叩き、結果をモーダル表示
 *   - 行クリックで /reservation?date=<その日> + ?focus=<予約ID> に遷移
 *     （focus は将来該当予約を自動オープンするための予約。現在は日付遷移のみ）
 */
export function CustomerCodeSearch() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<FoundCustomer[]>([]);

  const submit = () => {
    const v = code.trim();
    if (!v) return;
    setError(null);
    startTransition(async () => {
      const r = await findCustomerAppointmentsByCode(v);
      if (!r.ok) {
        setResults([]);
        setError(r.error);
        setOpen(true);
      } else {
        setResults(r.customers);
        setOpen(true);
      }
    });
  };

  const goto = (date: string, focusId: number) => {
    setOpen(false);
    router.push(`/reservation?date=${date}&focus=${focusId}`);
  };

  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex items-center gap-1.5"
      >
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="患者No."
          aria-label="患者番号で予約検索"
          className="!h-8 w-24 tabular-nums"
          inputMode="numeric"
          maxLength={20}
        />
        <Button
          type="submit"
          size="sm"
          variant="outline"
          disabled={pending || !code.trim()}
        >
          {pending ? "検索中…" : "検索"}
        </Button>
      </form>

      <Modal open={open} onClose={() => setOpen(false)} title="患者番号で検索">
        {error && (
          <p className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
        {!error && results.length === 0 && (
          <p className="text-sm text-muted">該当する患者が見つかりません。</p>
        )}
        {results.map((c) => (
          <div
            key={c.id}
            className="space-y-3 rounded-xl border border-line bg-base/40 p-4"
          >
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="rounded bg-accent/15 px-2 py-0.5 text-xs font-bold tabular-nums text-accent">
                No.{c.code}
              </span>
              <span className="text-base font-semibold text-ink">{c.name}</span>
              {c.kana && (
                <span className="text-xs text-muted">{c.kana}</span>
              )}
              {c.phone && (
                <span className="text-xs tabular-nums text-muted">
                  {c.phone}
                </span>
              )}
            </div>

            {c.appointments.length === 0 ? (
              <p className="text-xs text-muted">この患者の予約はありません。</p>
            ) : (
              <ul className="divide-y divide-line/70 rounded-lg border border-line bg-surface">
                {c.appointments.map((a) => {
                  const start = new Date(a.startAt);
                  const end = new Date(a.endAt);
                  return (
                    <li key={a.id}>
                      <button
                        type="button"
                        onClick={() => goto(a.date, a.id)}
                        className="flex w-full flex-wrap items-center gap-2 px-3 py-2 text-left text-sm hover:bg-base/60"
                      >
                        <span className="shrink-0 font-medium tabular-nums text-ink">
                          {dateLabelFmt.format(start)}
                        </span>
                        <span className="shrink-0 tabular-nums text-muted">
                          {timeLabelFmt.format(start)}〜
                          {timeLabelFmt.format(end)}
                        </span>
                        {a.menuName && (
                          <span className="text-muted">・{a.menuName}</span>
                        )}
                        {a.staffName && (
                          <span className="text-faint">／{a.staffName}</span>
                        )}
                        <span className="ml-auto rounded bg-base px-1.5 py-0.5 text-[11px] text-muted">
                          {statusLabel(a.status)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ))}
      </Modal>
    </>
  );
}
