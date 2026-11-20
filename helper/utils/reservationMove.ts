/**
 * 予約カードの移動（ドラッグ&ドロップ）と保存で、担当スタッフ・設備をどう
 * 付け替えるかの判定。予約ボードの列は次のルールで予約を振り分けている
 * （DayCalendar の byCol / PrintTimeline の apptsForColumn と同じ）:
 *   - スタッフ列: staffId がその人
 *   - 設備列   : staffId なし かつ equipmentId がその設備
 *   - 指名なし列: staffId も equipmentId もなし
 */

type Assignment = { staffId: number | null; equipmentId: number | null };

/**
 * カードを落とした列から、移動後の担当スタッフ・設備を決める。
 * - スタッフ列: そのスタッフに付け替え、設備はそのまま（施術に使う設備の
 *   空き判定を残すため）。
 * - 設備列: 担当なしにして、その設備へ付け替える。EXFIT①→EXFIT② や
 *   水素など、別の設備の列へ移したときに予約がその列に入るようにする。
 * - 指名なし列: 担当を外し、設備はそのまま（従来どおり）。
 */
export function resolveDropAssignment(
  row: Assignment,
  col: Assignment,
): Assignment {
  if (col.staffId != null) {
    return { staffId: col.staffId, equipmentId: row.equipmentId };
  }
  if (col.equipmentId != null) {
    return { staffId: null, equipmentId: col.equipmentId };
  }
  return { staffId: null, equipmentId: row.equipmentId };
}

/**
 * 予約を編集して保存するとき、今の設備をそのまま残すか。
 * 設備は通常メニューから決まるが、ドラッグで別の設備へ移した予約を
 * メモやステータスの修正で保存し直すと、メニューの設備（移動前の設備）に
 * 戻ってしまう。メニューを変えていない編集では今の設備を残し、
 * メニューを変えたときだけメニューの設備に合わせ直す。
 */
export function keepsEquipmentOnEdit(
  existing: { menuId: number | null } | null,
  menuId: number | null | undefined,
): boolean {
  if (!existing) return false;
  return (existing.menuId ?? null) === (menuId ?? null);
}
