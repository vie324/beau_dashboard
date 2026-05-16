import { getBookingLinkBySlug } from "@/feature/booking-link/services/getBookingLinkBySlug";
import { PublicBookingForm } from "@/feature/booking-link/components/PublicBookingForm";

export const dynamic = "force-dynamic";

export default async function PublicBookingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await getBookingLinkBySlug(slug);

  if (!data) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className="text-center">
          <div className="font-display text-3xl tracking-[0.2em] text-accent">
            BEAU
          </div>
          <p className="mt-4 text-sm text-muted">
            この予約リンクは現在ご利用いただけません。
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-10">
      <div className="mx-auto max-w-md">
        <div className="mb-6 text-center">
          <div className="font-display text-3xl tracking-[0.22em] text-accent">
            BEAU
          </div>
          <p className="mt-1 text-xs uppercase tracking-[0.3em] text-faint">
            Online Reservation
          </p>
        </div>

        <div className="rounded-xl border border-line bg-surface p-6 shadow-panel">
          <h1 className="text-lg font-semibold text-ink">{data.link.name}</h1>
          {data.link.description && (
            <p className="mt-1 mb-5 text-sm text-muted">
              {data.link.description}
            </p>
          )}
          <div className="mt-5">
            {data.menus.length === 0 || data.shops.length === 0 ? (
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

        <p className="mt-6 text-center text-[11px] text-faint">
          Powered by Beau
        </p>
      </div>
    </main>
  );
}
