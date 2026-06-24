"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatJpDate, shiftDateString } from "@/helper/utils/time";
import { Button } from "@/components/ui/Button";

export function DateNav({
  date,
  today,
}: {
  date: string;
  today: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const go = (d: string) =>
    startTransition(() => router.push(`/reservation?date=${d}`));

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      aria-busy={pending}
    >
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => go(shiftDateString(date, -1))}
        className="whitespace-nowrap"
      >
        ‹ 前日
      </Button>
      <Button
        size="sm"
        variant={date === today ? "primary" : "ghost"}
        disabled={pending}
        onClick={() => go(today)}
        className="whitespace-nowrap"
      >
        今日
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => go(shiftDateString(date, 1))}
        className="whitespace-nowrap"
      >
        翌日 ›
      </Button>
      <div className="ml-1 flex items-center gap-2 sm:ml-2">
        {/* 日付ラベル自体をタップするとネイティブの日付ピッカー（カレンダー）が開く。
            透明の <input type="date"> をラベル全面に重ねているので、スマホでも
            カレンダーから日付を選べる（PC も同じ操作）。別の入力欄を足さず既存の
            日付表示を再利用するため、横幅を取らず「前日/今日/翌日」と並べても窮屈にならない。 */}
        <label className="relative inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-line bg-base px-2.5 py-1 transition-colors hover:border-accent/60 focus-within:border-accent/60">
          <span className="whitespace-nowrap text-base font-semibold text-ink sm:text-lg">
            {formatJpDate(date)}
          </span>
          <span aria-hidden="true" className="text-xs leading-none text-muted">
            ▾
          </span>
          <input
            type="date"
            value={date}
            disabled={pending}
            onChange={(e) => e.target.value && go(e.target.value)}
            onClick={(e) => {
              // PC のブラウザはクリックだけではカレンダーが開かないことがあるため明示的に開く。
              // showPicker 非対応環境やジェスチャ外で弾かれた場合は、フォーカス時の
              // ネイティブ動作（スマホはタップで自動的にピッカーが開く）にフォールバックする。
              const el = e.currentTarget as HTMLInputElement & {
                showPicker?: () => void;
              };
              try {
                el.showPicker?.();
              } catch {
                // 失敗しても無視（フォーカスのネイティブ動作で代替）。
              }
            }}
            aria-label="日付を選択"
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
          />
        </label>
        {pending && (
          <span className="text-xs text-faint">読み込み中…</span>
        )}
      </div>
    </div>
  );
}
