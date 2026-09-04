// vitest 用の `server-only` スタブ。Next.js 実行時は本物（クライアントからの import を
// ビルド時に弾く）に解決されるが、vitest は Node で直接実行するため空モジュールに差し替える。
export {};
