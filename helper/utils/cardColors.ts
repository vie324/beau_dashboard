/**
 * 予約カードの標準カラー。予約モーダルの「背景色」にタイルで並べ、
 * ワンタップで色分けできるようにする（設定不要・全店舗共通）。
 *
 * カードの文字は本文色（ink）のままなので、どれも文字が読める淡めのトーンに
 * してある。それでも No.・メニュー名などの淡色文字や半透明のステータスバッジは
 * 色に沈むため、背景色付きのカードでは globals.css の .card-tinted で補う。
 *
 * 予約には hex 文字列をそのままコピーして保存する（CardColorPreset と同じ運用）。
 * ここの値を後から変えても、すでに色を付けた予約の色は変わらない。
 * hex は小文字で持つ（<input type="color"> の値と突き合わせるため）。
 */
export const STANDARD_CARD_COLORS: readonly { name: string; hex: string }[] = [
  { name: "黄色", hex: "#fbe18a" },
  { name: "赤", hex: "#f28b82" },
  { name: "青", hex: "#a5c4f2" },
  { name: "緑", hex: "#a3d9a5" },
  { name: "茶色", hex: "#c4a07e" },
  { name: "ピンク", hex: "#f7b3d1" },
  { name: "オレンジ", hex: "#fbb575" },
  { name: "紫", hex: "#c9b3f0" },
];

/** 色が標準カラーのどれかなら、その定義を返す（大文字・小文字は区別しない）。 */
export function findStandardCardColor(
  hex: string | null | undefined,
): { name: string; hex: string } | null {
  const v = (hex ?? "").trim().toLowerCase();
  if (!v) return null;
  return STANDARD_CARD_COLORS.find((c) => c.hex === v) ?? null;
}
