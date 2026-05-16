/** "HH:mm" slots from `startMin`..`endMin` (inclusive) every `stepMin`. */
export function timeSlots(
  stepMin: number,
  startMin = 6 * 60,
  endMin = 23 * 60 + 45,
): string[] {
  const out: string[] = [];
  for (let m = startMin; m <= endMin; m += stepMin) {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    out.push(`${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`);
  }
  return out;
}
