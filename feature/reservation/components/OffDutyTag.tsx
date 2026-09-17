/**
 * 出勤日として登録されていない臨時スタッフの列に付ける目印。
 * （その日の予約が残っているため例外的に列を出している、という説明）
 */
export function OffDutyTag() {
  return (
    <span
      title="出勤日として登録されていない日です。この日の予約が残っているため表示しています。"
      className="shrink-0 rounded border border-warn/40 bg-warn/10 px-1 py-px text-[10px] font-medium leading-none text-warn"
    >
      勤務外
    </span>
  );
}
