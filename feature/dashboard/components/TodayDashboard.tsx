import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { statusMeta } from "@/helper/utils/status";
import { jstMinutesOfDay } from "@/helper/utils/time";
import type { ReservationRow } from "@/feature/reservation/services/getReservations";

function minToTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export type TodayStats = {
  total: number;
  waiting: number;
  inService: number;
  done: number;
  cancelled: number;
  noShow: number;
  unconfirmed: number;
  sales: number;
};

function StatCard({
  label,
  value,
  tone = "default",
  suffix,
}: {
  label: string;
  value: number;
  tone?: "default" | "accent" | "warn" | "ok";
  suffix?: string;
}) {
  const toneClass =
    tone === "warn"
      ? "text-warn"
      : tone === "accent"
        ? "text-accent"
        : tone === "ok"
          ? "text-ok"
          : "text-ink";
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3 shadow-panel">
      <div className="text-xs text-muted">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${toneClass}`}>
        {value.toLocaleString("ja-JP")}
        {suffix && <span className="ml-0.5 text-sm font-normal">{suffix}</span>}
      </div>
    </div>
  );
}

function ApptRow({ r, date }: { r: ReservationRow; date: string }) {
  const s = jstMinutesOfDay(new Date(r.startAt));
  const e = jstMinutesOfDay(new Date(r.endAt));
  const name = r.customer?.name ?? r.guestName ?? "（名称未設定）";
  const meta = statusMeta(r.status);
  return (
    <Link
      href={`/reservation?date=${date}`}
      className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-elevated/40"
    >
      <span className="w-24 shrink-0 text-sm font-semibold tabular-nums text-ink">
        {minToTime(s)}–{minToTime(e)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-medium text-ink">{name}</span>
        </div>
        {r.menu && (
          <div className="truncate text-xs text-faint">{r.menu.name}</div>
        )}
      </div>
      {r.staff && (
        <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted">
          {r.staff.color && (
            <span
              className="h-2 w-2 rounded-full ring-1 ring-line"
              style={{ background: r.staff.color }}
            />
          )}
          {r.staff.name}
        </span>
      )}
      <Badge className={`${meta.className} shrink-0 whitespace-nowrap`}>
        {meta.label}
      </Badge>
    </Link>
  );
}

export function TodayDashboard({
  date,
  stats,
  upcoming,
  inService,
}: {
  date: string;
  stats: TodayStats;
  upcoming: ReservationRow[];
  inService: ReservationRow[];
}) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        <StatCard label="本日の予約" value={stats.total} />
        <StatCard label="来店待ち" value={stats.waiting} />
        <StatCard label="施術中" value={stats.inService} tone="accent" />
        <StatCard label="完了" value={stats.done} tone="ok" />
        <StatCard label="未確認" value={stats.unconfirmed} tone="warn" />
        <StatCard
          label="キャンセル / no-show"
          value={stats.cancelled + stats.noShow}
        />
        <StatCard
          label="売上（完了分）"
          value={stats.sales}
          suffix="円"
          tone="ok"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="overflow-hidden rounded-xl border border-line bg-surface shadow-panel">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="text-sm font-semibold text-ink">まもなく来店</h2>
            <span className="text-xs text-faint">{upcoming.length}件</span>
          </div>
          {upcoming.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-faint">
              来店待ちの予約はありません
            </p>
          ) : (
            <div className="divide-y divide-line/70">
              {upcoming.map((r) => (
                <ApptRow key={r.id} r={r} date={date} />
              ))}
            </div>
          )}
        </section>

        <section className="overflow-hidden rounded-xl border border-line bg-surface shadow-panel">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="text-sm font-semibold text-ink">施術中</h2>
            <span className="text-xs text-faint">{inService.length}件</span>
          </div>
          {inService.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-faint">
              現在施術中の予約はありません
            </p>
          ) : (
            <div className="divide-y divide-line/70">
              {inService.map((r) => (
                <ApptRow key={r.id} r={r} date={date} />
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="flex justify-end">
        <Link
          href={`/reservation?date=${date}`}
          className="rounded-xl border border-line bg-surface px-4 py-2 text-sm font-medium text-ink shadow-panel transition-colors hover:border-accent/70 hover:text-accent"
        >
          予約管理を開く ›
        </Link>
      </div>
    </div>
  );
}
