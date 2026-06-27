import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// `@/` パスエイリアスを tsconfig (paths: {"@/*": ["./*"]}) に合わせて解決する。
const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: { "@": root.replace(/\/$/, "") },
  },
  test: {
    // 既定は node。localStorage を使うテストはファイル先頭の
    // `// @vitest-environment jsdom` で個別に切り替える。
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**"],
  },
});
