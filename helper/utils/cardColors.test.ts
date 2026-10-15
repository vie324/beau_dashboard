import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  STANDARD_CARD_COLORS,
  findStandardCardColor,
} from "@/helper/utils/cardColors";

// WCAG 2 のコントラスト比。
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
/** fg を alpha で bg に重ねた色（text-ink/80 の見え方）。 */
function over(fg: string, bg: string, alpha: number): string {
  const ch = (hex: string, i: number) => parseInt(hex.slice(i, i + 2), 16);
  return `#${[1, 3, 5]
    .map((i) =>
      Math.round(ch(fg, i) * alpha + ch(bg, i) * (1 - alpha))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

// 管理画面の本文色。色は app/globals.css の :root に "R G B" の CSS 変数で定義している
// （tailwind.config.ts はそれを参照するだけ）ので、そこから読んで #rrggbb にする。
function adminColor(name: string): string {
  const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
  const root = css.match(/:root\s*\{[^}]*\}/)?.[0] ?? "";
  const m = root.match(new RegExp(`--c-${name}:\\s*(\\d+) (\\d+) (\\d+);`));
  if (!m) return "";
  return `#${m.slice(1, 4).map((v) => Number(v).toString(16).padStart(2, "0")).join("")}`;
}
const ink = adminColor("ink");

describe("予約カードの標準カラー", () => {
  it("依頼のあった 黄色・赤・青・緑・茶色・ピンク がそろっている", () => {
    const names = STANDARD_CARD_COLORS.map((c) => c.name);
    for (const n of ["黄色", "赤", "青", "緑", "茶色", "ピンク"]) {
      expect(names).toContain(n);
    }
  });

  it("色は小文字の #rrggbb で、名前も色も重複しない", () => {
    for (const c of STANDARD_CARD_COLORS) {
      expect(c.hex).toMatch(/^#[0-9a-f]{6}$/);
    }
    const hexes = STANDARD_CARD_COLORS.map((c) => c.hex);
    const names = STANDARD_CARD_COLORS.map((c) => c.name);
    expect(new Set(hexes).size).toBe(hexes.length);
    expect(new Set(names).size).toBe(names.length);
  });

  it("どの色でもカードの文字が読める（本文 4.5:1・補足文字 3:1 以上）", () => {
    expect(ink).toMatch(/^#[0-9a-f]{6}$/i);
    for (const c of STANDARD_CARD_COLORS) {
      expect(contrast(ink, c.hex), c.name).toBeGreaterThanOrEqual(4.5);
      // 背景色付きカードの補足文字は .card-tinted で ink の 80% にしている
      expect(contrast(over(ink, c.hex, 0.8), c.hex), c.name).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("findStandardCardColor", () => {
  it("大文字・前後の空白があっても標準カラーを見つける", () => {
    const red = STANDARD_CARD_COLORS.find((c) => c.name === "赤")!;
    expect(findStandardCardColor(red.hex)?.name).toBe("赤");
    expect(findStandardCardColor(` ${red.hex.toUpperCase()} `)?.name).toBe("赤");
  });

  it("未設定や標準以外の色は null", () => {
    expect(findStandardCardColor(null)).toBeNull();
    expect(findStandardCardColor("")).toBeNull();
    expect(findStandardCardColor("#123456")).toBeNull();
  });
});
