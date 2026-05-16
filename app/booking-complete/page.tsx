export default function BookingCompletePage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        <div className="font-display text-3xl tracking-[0.22em] text-accent">
          BEAU
        </div>
        <div className="mt-8 rounded-xl border border-line bg-surface p-8 shadow-panel">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-ok/40 bg-ok/10 text-2xl text-ok">
            ✓
          </div>
          <h1 className="text-lg font-semibold text-ink">
            ご予約を受け付けました
          </h1>
          <p className="mt-2 text-sm text-muted">
            確認のご連絡を担当者よりお送りいたします。
            <br />
            ご来店をお待ちしております。
          </p>
        </div>
        <p className="mt-6 text-xs text-faint">
          このページは閉じていただいて構いません。
        </p>
      </div>
    </main>
  );
}
