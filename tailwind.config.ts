import type { Config } from "tailwindcss";

// 色は CSS 変数（"R G B"）で定義し、`bg-accent/10` のような不透明度指定も効くようにする。
// 値は app/globals.css の :root（管理画面）にあり、お客様向け販売ページ（/shop）は
// .theme-store で別のパレットに差し替える（同じクラス名のまま配色だけ変わる）。
const c = (name: string) => `rgb(var(--c-${name}) / <alpha-value>)`;

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./feature/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Beau — warm, light & calm palette (salon / clinic inspired).
        base: c("base"), // warm ivory page
        surface: c("surface"), // cards
        elevated: c("elevated"), // hover / inputs
        line: c("line"), // borders
        ink: c("ink"), // primary text (soft warm brown, not black)
        muted: c("muted"),
        faint: c("faint"),
        accent: {
          DEFAULT: c("accent"), // warm gold
          soft: c("accent-soft"), // light tint background
          hover: c("accent-hover"),
          fg: c("accent-fg"), // text on accent
        },
        // 販売ページの差し色（テラコッタ）。期間限定ポイント・NEW 等に使う。
        clay: {
          DEFAULT: c("clay"),
          soft: c("clay-soft"),
        },
        ok: c("ok"),
        warn: c("warn"),
        danger: c("danger"),
        info: c("info"),
      },
      // 注意: 色に `base` があるため `text-base` は「フォントサイズ 1rem」と
      // 「文字色 #f4efe6」の両方の CSS を生成し、色の方がアルファベット順で
      // text-accent より後に出るため accent 文字を背景色で潰してしまう。
      // 16px のフォントサイズには `text-md` を使うこと。
      fontSize: {
        md: ["1rem", { lineHeight: "1.5rem" }],
      },
      fontFamily: {
        sans: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Hiragino Kaku Gothic ProN",
          "Hiragino Sans",
          "Meiryo",
          "sans-serif",
        ],
        // 見出し用。既定は Georgia、販売ページでは明朝（Shippori Mincho）に差し替わる。
        display: "var(--font-display)",
        // 英字の飾り見出し（"Online Store" 等）。販売ページでは Cormorant Garamond。
        accent: "var(--font-accent)",
      },
      borderRadius: {
        xl: "0.625rem",
      },
      boxShadow: {
        panel:
          "0 1px 2px 0 rgba(80,60,30,0.04), 0 14px 32px -20px rgba(80,60,30,0.22)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in-right": {
          from: { transform: "translateX(100%)" },
          to: { transform: "translateX(0)" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.96)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        pop: {
          "0%": { transform: "scale(1)" },
          "50%": { transform: "scale(1.18)" },
          "100%": { transform: "scale(1)" },
        },
        // ---- 販売ページの動き ----
        rise: {
          from: { opacity: "0", transform: "translateY(18px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        float: {
          "0%, 100%": { transform: "translate3d(0,0,0) scale(1)" },
          "50%": { transform: "translate3d(18px,-26px,0) scale(1.06)" },
        },
        "float-slow": {
          "0%, 100%": { transform: "translate3d(0,0,0) rotate(0deg)" },
          "50%": { transform: "translate3d(-14px,18px,0) rotate(6deg)" },
        },
        sway: {
          "0%, 100%": { transform: "rotate(-4deg)" },
          "50%": { transform: "rotate(4deg)" },
        },
        marquee: {
          from: { transform: "translateX(0)" },
          to: { transform: "translateX(-50%)" },
        },
        shimmer: {
          from: { backgroundPosition: "-200% 0" },
          to: { backgroundPosition: "200% 0" },
        },
        settle: {
          from: { transform: "scale(1.12)" },
          to: { transform: "scale(1)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.16s ease-out",
        "slide-in-right": "slide-in-right 0.24s cubic-bezier(0.22,1,0.36,1)",
        "slide-up": "slide-up 0.3s ease-out both",
        "scale-in": "scale-in 0.18s ease-out",
        pop: "pop 0.3s ease-out",
        rise: "rise 0.9s cubic-bezier(0.22,1,0.36,1) both",
        float: "float 16s ease-in-out infinite",
        "float-slow": "float-slow 22s ease-in-out infinite",
        sway: "sway 7s ease-in-out infinite",
        marquee: "marquee 38s linear infinite",
        shimmer: "shimmer 6s linear infinite",
        settle: "settle 2.6s cubic-bezier(0.22,1,0.36,1) both",
        "spin-slow": "spin 60s linear infinite",
      },
      transitionTimingFunction: {
        silk: "cubic-bezier(0.22,1,0.36,1)",
      },
    },
  },
  plugins: [],
};

export default config;
