import { getBookingLinkBySlug } from "@/feature/booking-link/services/getBookingLinkBySlug";
import { PublicBookingForm } from "@/feature/booking-link/components/PublicBookingForm";

export const dynamic = "force-dynamic";

function Brand() {
  return (
    <div className="mb-7 text-center">
      <div className="font-display text-3xl tracking-[0.22em] text-accent">
        Dreamland
      </div>
      <div className="mx-auto mt-2 flex items-center justify-center gap-3">
        <span className="h-px w-8 bg-accent/40" />
        <p className="text-[10px] uppercase tracking-[0.35em] text-faint">
          Online Reservation
        </p>
        <span className="h-px w-8 bg-accent/40" />
      </div>
    </div>
  );
}

export default async function PublicBookingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await getBookingLinkBySlug(slug);

  if (!data) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-accent-soft/50 to-base px-4">
        <div className="w-full max-w-md text-center">
          <Brand />
          <div className="rounded-2xl border border-line bg-surface px-6 py-10 shadow-panel">
            <p className="text-sm text-muted">
              この予約リンクは現在ご利用いただけません。
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-accent-soft/50 via-base to-base px-4 py-10">
      <div className="mx-auto max-w-lg">
        <Brand />

        <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-panel">
          <div className="border-b border-line/70 bg-gradient-to-br from-accent-soft/70 to-surface px-6 py-6">
            <h1 className="text-xl font-semibold leading-snug text-ink text-balance">
              {data.link.name}
            </h1>
            {data.link.description && (
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted">
                {data.link.description}
              </p>
            )}
            {data.notices.length > 0 && (
              <ul className="mt-4 space-y-1.5 rounded-xl border border-accent/30 bg-surface/80 px-4 py-3 text-xs leading-relaxed text-ink">
                {data.notices.map((n) => (
                  <li key={n} className="flex gap-2">
                    <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-accent" />
                    <span>{n}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="px-5 py-6 sm:px-6">
            {data.status.state !== "open" ? (
              <div className="rounded-xl border border-line bg-base px-4 py-8 text-center">
                <p className="text-sm font-medium text-ink">
                  {data.status.message}
                </p>
                {data.status.state !== "before" && (
                  <p className="mt-2 text-xs text-muted">
                    ご予約・お問い合わせは店舗まで直接ご連絡ください。
                  </p>
                )}
              </div>
            ) : data.menus.length === 0 || data.shops.length === 0 ? (
              <p className="rounded-xl border border-line bg-base px-4 py-6 text-center text-sm text-muted">
                現在オンラインで予約できるメニューがありません。
                <br />
                お手数ですが店舗まで直接お問い合わせください。
              </p>
            ) : (
              <PublicBookingForm slug={slug} data={data} />
            )}
          </div>
        </div>

        <p className="mt-8 text-center text-[11px] tracking-wider text-faint">
          Powered by Dreamland
        </p>
      </div>
    </main>
  );
}
