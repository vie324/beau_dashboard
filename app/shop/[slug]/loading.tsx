export default function StoreLoading() {
  return (
    <div className="min-h-screen bg-base">
      <div className="h-8 bg-ink" />
      <div className="h-16 sm:h-[4.5rem]">
        <div className="mx-auto flex h-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 animate-pulse rounded-full bg-elevated" />
            <div className="h-5 w-40 animate-pulse rounded-full bg-elevated" />
          </div>
          <div className="flex gap-2">
            <div className="h-10 w-10 animate-pulse rounded-full bg-elevated" />
            <div className="h-10 w-10 animate-pulse rounded-full bg-elevated" />
          </div>
        </div>
      </div>
      <main className="mx-auto max-w-6xl px-4 pt-5 sm:px-6 sm:pt-8">
        <div className="grid items-center gap-10 rounded-[2rem] border border-line/60 bg-surface px-6 py-14 sm:px-12 md:grid-cols-2">
          <div className="space-y-4">
            <div className="mx-auto h-4 w-28 animate-pulse rounded-full bg-elevated md:mx-0" />
            <div className="mx-auto h-10 w-72 max-w-full animate-pulse rounded-full bg-elevated md:mx-0" />
            <div className="mx-auto h-3 w-80 max-w-full animate-pulse rounded-full bg-elevated md:mx-0" />
            <div className="mx-auto h-12 w-40 animate-pulse rounded-full bg-elevated md:mx-0" />
          </div>
          <div className="mx-auto aspect-[4/5] w-56 animate-pulse rounded-b-[2.5rem] rounded-t-full bg-elevated" />
        </div>
        <div className="mt-20 h-7 w-44 animate-pulse rounded-full bg-elevated" />
        <div className="mt-8 grid grid-cols-2 gap-x-3 gap-y-9 sm:grid-cols-3 sm:gap-x-5 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i}>
              <div className="aspect-[4/5] animate-pulse rounded-[1.25rem] bg-elevated" />
              <div className="mt-3 space-y-2">
                <div className="h-3 w-full animate-pulse rounded-full bg-elevated" />
                <div className="h-3 w-2/3 animate-pulse rounded-full bg-elevated" />
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
