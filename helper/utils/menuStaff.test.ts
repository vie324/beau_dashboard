import { describe, it, expect } from "vitest";
import {
  parseStaffIds,
  activeMenuStaffIds,
  capableStaffIds,
  canStaffHandleMenu,
} from "@/helper/utils/menuStaff";

// 岡本=1 / 久保=2 / 堀口=3 の店舗を想定
const SHOP = [1, 2, 3];

describe("parseStaffIds", () => {
  it("JSON配列を重複なし・昇順で読む", () => {
    expect(parseStaffIds("[3,1,1,2]")).toEqual([1, 2, 3]);
  });
  it("空/不正な値は空配列", () => {
    expect(parseStaffIds(null)).toEqual([]);
    expect(parseStaffIds("")).toEqual([]);
    expect(parseStaffIds("なにか")).toEqual([]);
    expect(parseStaffIds('{"a":1}')).toEqual([]);
  });
  it("整数でないID・0以下は捨てる", () => {
    expect(parseStaffIds('[1,"2",0,-3,1.5,null]')).toEqual([1, 2]);
  });
});

describe("activeMenuStaffIds", () => {
  it("指定なしは制限なし（空配列）", () => {
    expect(activeMenuStaffIds(SHOP, [])).toEqual([]);
  });
  it("この店舗に居るスタッフの指定だけが効く", () => {
    expect(activeMenuStaffIds(SHOP, [1, 2, 99])).toEqual([1, 2]);
  });
  it("他店舗のスタッフだけの指定はこの店舗では効かない", () => {
    expect(activeMenuStaffIds(SHOP, [98, 99])).toEqual([]);
  });
});

describe("capableStaffIds", () => {
  it("指定なしなら全員対応", () => {
    expect(capableStaffIds(SHOP, [])).toEqual([1, 2, 3]);
  });
  it("治療メニュー: 岡本・久保だけ（堀口は外れる）", () => {
    expect(capableStaffIds(SHOP, [1, 2])).toEqual([1, 2]);
  });
  it("他店舗のスタッフだけを指定したメニューは制限なし扱い", () => {
    expect(capableStaffIds(SHOP, [98, 99])).toEqual([1, 2, 3]);
  });
  it("退職などで対象者が居なくなったら制限なしに戻る", () => {
    expect(capableStaffIds([1, 2], [3])).toEqual([1, 2]);
  });
});

describe("canStaffHandleMenu", () => {
  it("美容メニュー（制限なし）は堀口も担当できる", () => {
    expect(canStaffHandleMenu(3, SHOP, [])).toBe(true);
  });
  it("治療メニューは堀口には割り当てない", () => {
    expect(canStaffHandleMenu(3, SHOP, [1, 2])).toBe(false);
    expect(canStaffHandleMenu(1, SHOP, [1, 2])).toBe(true);
  });
});
