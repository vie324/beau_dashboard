export default function StoreLoading() {
  return (
    <main className="min-h-screen bg-base px-4 py-8">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex flex-col items-center gap-2">
          <div className="h-7 w-48 animate-pulse rounded bg-elevated" />
          <div className="h-3 w-24 animate-pulse rounded bg-elevated" />
        </div>
        <div className="mb-5 h-10 w-full animate-pulse rounded-xl bg-elevated" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="overflow-hidden rounded-2xl border border-line bg-surface"
            >
              <div className="aspect-square animate-pulse bg-elevated" />
              <div className="space-y-2 p-3">
                <div className="h-3 w-full animate-pulse rounded bg-elevated" />
                <div className="h-3 w-2/3 animate-pulse rounded bg-elevated" />
                <div className="h-8 w-full animate-pulse rounded-xl bg-elevated" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
