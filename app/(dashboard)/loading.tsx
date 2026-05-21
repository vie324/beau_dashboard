export default function DashboardLoading() {
  return (
    <div
      className="flex items-center justify-center py-20 text-sm text-muted"
      role="status"
      aria-live="polite"
    >
      <span
        aria-hidden
        className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-accent"
      />
      <span className="ml-3">読み込み中…</span>
    </div>
  );
}
