/**
 * メニューごとの「対応できるスタッフ」の判定ロジック（MenuStaff テーブル）。
 *
 * ルール:
 *   - メニューに対応スタッフが1人も登録されていない → 制限なし（全員対応）
 *   - 登録されている → そのスタッフだけが対応できる
 *
 * Staff は店舗スコープなので、全店舗共通メニュー (shopId = null) でも
 * 店舗ごとに別々の対応スタッフを設定できる。ある店舗に対象者が1人も
 * いないメニューは、その店舗では「制限なし」として扱う（他店舗向けの
 * 設定のせいで、設定していない店舗の予約枠が全部消えるのを避けるため）。
 */

/** Parse the staff-ids JSON that the settings form posts. */
export function parseStaffIds(raw: string | null | undefined): number[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return [
      ...new Set(v.map(Number).filter((n) => Number.isInteger(n) && n > 0)),
    ].sort((a, b) => a - b);
  } catch {
    return [];
  }
}

/**
 * この店舗で実際に効いている対応スタッフの指定。空配列 = 制限なし。
 * @param shopStaffIds その店舗の（予約可能な）スタッフID
 * @param menuStaffIds メニューに登録された対応スタッフID（全店舗ぶん）
 */
export function activeMenuStaffIds(
  shopStaffIds: number[],
  menuStaffIds: number[],
): number[] {
  if (menuStaffIds.length === 0) return [];
  const inShop = new Set(shopStaffIds);
  return menuStaffIds.filter((id) => inShop.has(id));
}

/** このメニューを担当できる、店舗内のスタッフID一覧。 */
export function capableStaffIds(
  shopStaffIds: number[],
  menuStaffIds: number[],
): number[] {
  const active = activeMenuStaffIds(shopStaffIds, menuStaffIds);
  if (active.length === 0) return shopStaffIds;
  const allow = new Set(active);
  return shopStaffIds.filter((id) => allow.has(id));
}

/** 指定スタッフがこのメニューを担当できるか（制限が無ければ常に true）。 */
export function canStaffHandleMenu(
  staffId: number,
  shopStaffIds: number[],
  menuStaffIds: number[],
): boolean {
  const active = activeMenuStaffIds(shopStaffIds, menuStaffIds);
  return active.length === 0 || active.includes(staffId);
}
