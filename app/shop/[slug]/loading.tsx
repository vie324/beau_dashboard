export default function StoreLoading() {
  return (
    <div className="min-h-screen bg-base">
      <div className="h-14 border-b border-line/80 bg-base/90 sm:h-16">
        <div className="mx-auto flex h-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="h-5 w-40 animate-pulse rounded bg-elevated" />
          <div className="flex gap-2">
            <div className="h-10 w-24 animate-pulse rounded-full bg-elevated" />
            <div className="h-10 w-10 animate-pulse rounded-full bg-elevated" />
          </div>
        </div>
      </div>
      <main className="mx-auto max-w-6xl px-4 pt-4 sm:px-6 sm:pt-6">
        <div className="rounded-3xl border border-line bg-surface px-6 py-12 text-center">
          <div className="mx-auto h-3 w-24 animate-pulse rounded bg-elevated" />
          <div className="mx-auto mt-3 h-8 w-64 animate-pulse rounded bg-elevated" />
          <div className="mx-auto mt-4 h-3 w-80 max-w-full animate-pulse rounded bg-elevated" />
          <div className="mt-6 flex justify-center gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-7 w-28 animate-pulse rounded-full bg-elevated" />
            ))}
          </div>
        </div>
        <div className="mt-10 h-6 w-40 animate-pulse rounded bg-elevated" />
        <div className="mt-4 h-10 w-full animate-pulse rounded-xl bg-elevated" />
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="overflow-hidden rounded-2xl border border-line bg-surface"
            >
              <div className="aspect-square animate-pulse bg-elevated" />
              <div className="space-y-2 p-3">
                <div className="h-3 w-full animate-pulse rounded bg-elevated" />
                <div className="h-3 w-2/3 animate-pulse rounded bg-elevated" />
                <div className="h-9 w-full animate-pulse rounded-xl bg-elevated" />
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
