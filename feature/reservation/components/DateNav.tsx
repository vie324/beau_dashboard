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
        <span className="whitespace-nowrap text-base font-semibold text-ink sm:text-lg">
          {formatJpDate(date)}
        </span>
        {/* モバイルでは日付ピッカーは省略（左上が窮屈になるため）。
            日付変更は「前日/今日/翌日」ボタンで行える。 */}
        <input
          type="date"
          value={date}
          disabled={pending}
          onChange={(e) => e.target.value && go(e.target.value)}
          className="hidden h-8 rounded-xl border border-line bg-base px-2 text-xs text-muted focus:border-accent/60 focus:outline-none disabled:opacity-50 sm:block"
        />
        {pending && (
          <span className="text-xs text-faint">読み込み中…</span>
        )}
      </div>
    </div>
  );
}
