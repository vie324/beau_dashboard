import type { Config } from "tailwindcss";

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
        base: "#f4efe6", // warm ivory page
        surface: "#fffefb", // cards
        elevated: "#efe8da", // hover / inputs
        line: "#e4dccb", // borders
        ink: "#3b352c", // primary text (soft warm brown, not black)
        muted: "#6f6757",
        faint: "#9c937f",
        accent: {
          DEFAULT: "#c19a5b", // warm gold
          soft: "#f1e7d3", // light tint background
          hover: "#a9803f",
          fg: "#2b2114", // dark text on gold
        },
        ok: "#3f9d6b",
        warn: "#c6892f",
        danger: "#c8554f",
        info: "#5580ad",
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
        display: ["Georgia", "Times New Roman", "serif"],
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
      },
      animation: {
        "fade-in": "fade-in 0.16s ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
