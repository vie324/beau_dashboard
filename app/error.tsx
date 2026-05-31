"use client";

/**
 * ダッシュボード全体の実行時エラー境界。
 *
 * 以前は「データベースに接続されていません」固定文言だったが、これは
 * 接続できているのにスキーマ不一致（例: マイグレーション未適用で列が無い）
 * などの別エラーが起きたときに誤誘導になっていた。
 * いまはエラー内容を見て「接続不可」と「その他のエラー」を出し分ける。
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const msg = (error?.message ?? "").toLowerCase();
  // Prisma の接続不能エラー（P1001/P1000/P1017）や URL 未設定らしき兆候。
  // それ以外（P2022 列なし等のスキーマ不一致を含む）は「その他のエラー」扱い。
  const looksLikeConnection =
    msg.includes("p1001") ||
    msg.includes("p1000") ||
    msg.includes("p1017") ||
    msg.includes("can't reach database") ||
    msg.includes("cannot reach database") ||
    msg.includes("database_url") ||
    msg.includes("environment variable not found");

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        <div className="font-display text-3xl tracking-[0.22em] text-accent">
          Dreamland
        </div>
        <div className="mt-8 rounded-xl border border-line bg-surface p-8 shadow-panel">
          {looksLikeConnection ? (
            <>
              <h1 className="text-lg font-semibold text-ink">
                データベースに接続されていません
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-muted">
                この画面の表示にはデータベース接続が必要です。
                <br />
                Vercel の環境変数{" "}
                <code className="text-accent">DATABASE_URL</code>{" "}
                を設定すると、ログインや予約管理が利用できるようになります。
              </p>
            </>
          ) : (
            <>
              <h1 className="text-lg font-semibold text-ink">
                エラーが発生しました
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-muted">
                データには接続できていますが、画面の表示中に問題が発生しました。
                <br />
                「再読み込み」をお試しください。繰り返す場合は、下のエラーIDを添えてご連絡ください。
              </p>
            </>
          )}
          <button
            onClick={reset}
            className="mt-6 inline-flex h-9 items-center rounded-xl border border-line bg-base px-4 text-sm text-ink transition-colors hover:border-accent/60 hover:text-accent"
          >
            再読み込み
          </button>
          {error?.digest && (
            <p className="mt-4 text-[11px] text-faint">
              エラーID: <code className="tabular-nums">{error.digest}</code>
            </p>
          )}
        </div>
        <p className="mt-6 text-center text-[11px] text-faint">
          Powered by Dreamland
        </p>
      </div>
    </main>
  );
}
