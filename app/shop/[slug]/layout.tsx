import type { ReactNode } from "react";
import { Cormorant_Garamond, Shippori_Mincho } from "next/font/google";

// 見出しの明朝。日本語の字形は Google Fonts の unicode-range 分割で、
// ページで使う文字の分だけ読み込まれる（preload は英字だけに絞るため false）。
const serif = Shippori_Mincho({
  weight: ["500", "600"],
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--font-store-serif",
});

// 英字の飾り見出し（"Online Store" / ランキングの数字 等）。
const accent = Cormorant_Garamond({
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-store-accent",
});

/**
 * お客様向け販売ページ（/shop/<slug> 配下すべて）の外枠。
 * .theme-store で配色（app/globals.css）とフォントを販売ページ用に切り替える。
 * 管理画面とは同じ Tailwind のクラス名を使うので、ここで囲むだけで配色が変わる。
 */
export default function ShopLayout({ children }: { children: ReactNode }) {
  return (
    <div className={`theme-store min-h-screen ${serif.variable} ${accent.variable}`}>
      {children}
    </div>
  );
}
