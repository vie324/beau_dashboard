"use client";

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

  const go = (d: string) => router.push(`/reservation?date=${d}`);

  return (
    <div className="flex items-center gap-2">
      <Button size="sm" variant="outline" onClick={() => go(shiftDateString(date, -1))}>
        ‹ 前日
      </Button>
      <Button
        size="sm"
        variant={date === today ? "primary" : "ghost"}
        onClick={() => go(today)}
      >
        今日
      </Button>
      <Button size="sm" variant="outline" onClick={() => go(shiftDateString(date, 1))}>
        翌日 ›
      </Button>
      <div className="ml-2 flex items-center gap-2">
        <span className="text-lg font-semibold text-ink">
          {formatJpDate(date)}
        </span>
        <input
          type="date"
          value={date}
          onChange={(e) => e.target.value && go(e.target.value)}
          className="h-8 rounded-xl border border-line bg-base px-2 text-xs text-muted focus:border-accent/60 focus:outline-none"
        />
      </div>
    </div>
  );
}
