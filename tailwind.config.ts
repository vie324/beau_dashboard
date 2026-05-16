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
        // Beau — modern dark palette (distinct from the reference's light/pastel shadcn theme)
        base: "#0b0d12",
        surface: "#14171f",
        elevated: "#1b1f29",
        line: "#272c39",
        ink: "#e8eaf0",
        muted: "#8b92a4",
        faint: "#5b6276",
        accent: {
          DEFAULT: "#d8b06a",
          soft: "#3a3119",
          hover: "#e6c386",
          fg: "#1a1305",
        },
        ok: "#5fb98a",
        warn: "#e0a64b",
        danger: "#e0696b",
        info: "#6f9bd8",
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
        panel: "0 1px 0 0 rgba(255,255,255,0.03) inset, 0 18px 40px -24px rgba(0,0,0,0.7)",
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
