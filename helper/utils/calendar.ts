/** 月カレンダー（日付選択 UI）用のヘルパー。日付は "YYYY-MM-DD"、月は "YYYY-MM"。 */

/** "YYYY-MM" を delta か月ずらす。 */
export function shiftMonth(monthStr: string, delta: number): string {
  const [y, m] = monthStr.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** 日曜始まり・6週分のセル。その月以外のセルは null。 */
export function buildMonthCells(monthStr: string): (string | null)[][] {
  const [y, m] = monthStr.split("-").map(Number);
  const startDow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const flat: (string | null)[] = [];
  for (let i = 0; i < 42; i++) {
    const dayNum = i - startDow + 1;
    if (dayNum < 1 || dayNum > daysInMonth) {
      flat.push(null);
    } else {
      flat.push(
        `${y}-${String(m).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`,
      );
    }
  }
  const rows: (string | null)[][] = [];
  for (let i = 0; i < 6; i++) rows.push(flat.slice(i * 7, (i + 1) * 7));
  return rows;
}
