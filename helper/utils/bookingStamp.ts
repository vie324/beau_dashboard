/**
 * 予約の「登録日時」「最終更新」の表示用。
 *
 * 日付違い・消し忘れによる二重予約などの予約ミスが起きたときに、患者番号検索や
 * 予約モーダルで「その予約をいつ入力したか」を見て、その時間帯に誰が受付に
 * いたか・どちらの予約が後から入ったかを判断するために使う。
 *
 *   - 登録日時   … Appointment.createdAt（予約を保存して確定した日時）
 *   - 最終更新   … Appointment.updatedAt（日時・担当・ステータス等を最後に保存した日時）
 */

const dateFmt = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
});
const timeFmt = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  hour: "2-digit",
  minute: "2-digit",
});

/** "2026/09/28(月) 14:32"（JST・分まで）。 */
export function formatStamp(d: Date | string): string {
  const date = new Date(d);
  return `${dateFmt.format(date)} ${timeFmt.format(date)}`;
}

/**
 * 登録したあとに保存し直されているか。
 * createdAt と updatedAt は新規作成時にそれぞれ別に入るので、作成直後でも
 * ぴったり一致するとは限らない。1分未満の差は「登録したまま」とみなし、
 * 最終更新を出さない（表示は分単位なので、出しても登録日時と同じになる）。
 */
export function wasUpdatedAfterCreate(
  createdAt: Date | string,
  updatedAt: Date | string,
): boolean {
  return new Date(updatedAt).getTime() - new Date(createdAt).getTime() >= 60_000;
}
