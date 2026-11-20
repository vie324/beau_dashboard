import { describe, it, expect } from "vitest";
import {
  resolveDropAssignment,
  keepsEquipmentOnEdit,
} from "@/helper/utils/reservationMove";

// 設備: EXFIT①=10 / EXFIT②=11 / 水素=12、スタッフ: 野下=1 / 太子=2
const EXFIT1_COL = { staffId: null, equipmentId: 10 };
const EXFIT2_COL = { staffId: null, equipmentId: 11 };
const HYDROGEN_COL = { staffId: null, equipmentId: 12 };
const NOSHITA_COL = { staffId: 1, equipmentId: null };
const UNASSIGNED_COL = { staffId: null, equipmentId: null };

describe("resolveDropAssignment", () => {
  it("EXFIT① の予約を EXFIT② の列に落とすと設備が EXFIT② になる", () => {
    const row = { staffId: null, equipmentId: 10 };
    expect(resolveDropAssignment(row, EXFIT2_COL)).toEqual({
      staffId: null,
      equipmentId: 11,
    });
  });

  it("EXFIT① の予約を水素の列に落とすと設備が水素になる", () => {
    const row = { staffId: null, equipmentId: 10 };
    expect(resolveDropAssignment(row, HYDROGEN_COL)).toEqual({
      staffId: null,
      equipmentId: 12,
    });
  });

  it("同じ設備の列に落としたら（時刻だけの移動）設備は変わらない", () => {
    const row = { staffId: null, equipmentId: 10 };
    expect(resolveDropAssignment(row, EXFIT1_COL)).toEqual(row);
  });

  it("スタッフの予約を設備の列に落とすと担当なし・その設備になる", () => {
    const row = { staffId: 2, equipmentId: null };
    expect(resolveDropAssignment(row, EXFIT2_COL)).toEqual({
      staffId: null,
      equipmentId: 11,
    });
  });

  it("スタッフ列に落とすと担当が変わり、設備はそのまま", () => {
    const row = { staffId: null, equipmentId: 10 };
    expect(resolveDropAssignment(row, NOSHITA_COL)).toEqual({
      staffId: 1,
      equipmentId: 10,
    });
  });

  it("指名なし列に落とすと担当が外れ、設備はそのまま", () => {
    const row = { staffId: 2, equipmentId: 10 };
    expect(resolveDropAssignment(row, UNASSIGNED_COL)).toEqual({
      staffId: null,
      equipmentId: 10,
    });
  });
});

describe("keepsEquipmentOnEdit", () => {
  it("新規作成（既存なし）はメニューの設備を使う", () => {
    expect(keepsEquipmentOnEdit(null, 5)).toBe(false);
  });

  it("メニューを変えていない編集は今の設備を残す", () => {
    expect(keepsEquipmentOnEdit({ menuId: 5 }, 5)).toBe(true);
  });

  it("メニューなしのまま編集しても今の設備を残す", () => {
    expect(keepsEquipmentOnEdit({ menuId: null }, undefined)).toBe(true);
    expect(keepsEquipmentOnEdit({ menuId: null }, null)).toBe(true);
  });

  it("メニューを変えたらメニューの設備に合わせ直す", () => {
    expect(keepsEquipmentOnEdit({ menuId: 5 }, 6)).toBe(false);
    expect(keepsEquipmentOnEdit({ menuId: 5 }, undefined)).toBe(false);
    expect(keepsEquipmentOnEdit({ menuId: null }, 6)).toBe(false);
  });
});
