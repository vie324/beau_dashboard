"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        <div className="font-display text-3xl tracking-[0.22em] text-accent">
          BEAU
        </div>
        <div className="mt-8 rounded-xl border border-line bg-surface p-8 shadow-panel">
          <h1 className="text-lg font-semibold text-ink">
            データベースに接続されていません
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            この画面の表示にはデータベース接続が必要です。
            <br />
            Vercel の環境変数 <code className="text-accent">DATABASE_URL</code>{" "}
            を設定すると、ログインや予約管理が利用できるようになります。
          </p>
          <button
            onClick={reset}
            className="mt-6 inline-flex h-9 items-center rounded-xl border border-line bg-base px-4 text-sm text-ink transition-colors hover:border-accent/60 hover:text-accent"
          >
            再読み込み
          </button>
        </div>
        <p className="mt-6 text-center text-[11px] text-faint">
          Powered by Beau
        </p>
      </div>
    </main>
  );
}
