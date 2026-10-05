"use client";

import { useMemo, useState } from "react";
import { buildMonthCells, shiftMonth } from "@/helper/utils/calendar";

/**
 * 複数の日付を選べる月カレンダー（予約リンクの日付限定・枠限定で使う）。
 * 過去の日は新しく選べない（選択済みなら外すことはできる）。
 */
export function MultiDateCalendar({
  selected,
  onToggle,
  today,
  marked,
  markLabel,
}: {
  selected: string[];
  onToggle: (date: string) => void;
  /** 今日（JST "YYYY-MM-DD"） */
  today: string;
  /** 印（点）を付ける日。枠を登録済みの日など */
  marked?: Set<string>;
  /** 印の意味（凡例） */
  markLabel?: string;
}) {
  const [month, setMonth] = useState(
    () => (selected.find((d) => d >= today) ?? today).slice(0, 7),
  );
  const rows = useMemo(() => buildMonthCells(month), [month]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const [y, m] = month.split("-").map(Number);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setMonth(shiftMonth(month, -1))}
          className="rounded-lg border border-line px-3 py-1 text-xs text-muted hover:border-accent/60 hover:text-accent"
        >
          ‹ 前月
        </button>
        <span className="text-sm font-medium text-ink">
          {y}年{m}月
        </span>
        <button
          type="button"
          onClick={() => setMonth(shiftMonth(month, 1))}
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
                const on = selectedSet.has(cell);
                const past = cell < today;
                const isToday = cell === today;
                const hasMark = marked?.has(cell) ?? false;
                return (
                  <td key={ci} className="border border-line/40 p-0">
                    <button
                      type="button"
                      onClick={() => onToggle(cell)}
                      disabled={past && !on}
                      aria-pressed={on}
                      aria-label={`${Number(cell.slice(5, 7))}月${Number(cell.slice(8, 10))}日`}
                      className={`relative flex h-9 w-full flex-col items-center justify-center text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
                        on
                          ? "bg-accent font-semibold text-accent-fg"
                          : "hover:bg-elevated/50"
                      } ${!on && isToday ? "ring-1 ring-inset ring-accent/50" : ""} ${
                        on
                          ? ""
                          : ci === 0
                            ? "text-danger"
                            : ci === 6
                              ? "text-info"
                              : "text-ink"
                      }`}
                    >
                      {Number(cell.slice(8, 10))}
                      {hasMark && (
                        <span
                          className={`absolute bottom-1 h-1 w-1 rounded-full ${
                            on ? "bg-accent-fg" : "bg-accent"
                          }`}
                        />
                      )}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {markLabel && marked && marked.size > 0 && (
        <p className="flex items-center gap-1.5 text-[11px] text-faint">
          <span className="inline-block h-1 w-1 rounded-full bg-accent" />
          {markLabel}
        </p>
      )}
    </div>
  );
}
