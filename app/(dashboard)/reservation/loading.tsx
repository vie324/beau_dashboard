export default function ReservationLoading() {
  return (
    <div className="animate-fade-in space-y-4">
      <div className="flex items-center justify-between">
        <div className="h-7 w-40 rounded-lg bg-elevated" />
        <div className="h-8 w-56 rounded-lg bg-elevated" />
      </div>
      <div className="h-[520px] w-full rounded-xl border border-line bg-surface">
        <div className="flex h-full animate-pulse items-center justify-center text-sm text-faint">
          読み込み中…
        </div>
      </div>
    </div>
  );
}
