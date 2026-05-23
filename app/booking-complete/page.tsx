import { db } from "@/helper/lib/db";

export const dynamic = "force-dynamic";

async function getShopLine(
  shopParam?: string,
): Promise<{ name: string; lineUrl: string } | null> {
  const id = Number(shopParam);
  if (!Number.isInteger(id) || id <= 0) return null;
  try {
    const shop = await db.shop.findFirst({
      where: { id, deletedAt: null },
      select: { name: true, lineUrl: true },
    });
    if (!shop?.lineUrl) return null;
    return { name: shop.name, lineUrl: shop.lineUrl };
  } catch {
    return null;
  }
}

export default async function BookingCompletePage({
  searchParams,
}: {
  searchParams: Promise<{ shop?: string }>;
}) {
  const { shop } = await searchParams;
  const line = await getShopLine(shop);

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        <div className="font-display text-3xl tracking-[0.22em] text-accent">
          Dreamland
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

          {line && (
            <div className="mt-6 border-t border-line pt-6">
              <p className="text-sm text-ink">
                LINEを追加すると、確認・リマインドの連絡をスムーズにお送りできます。
              </p>
              <a
                href={line.lineUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-xl bg-[#06C755] px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90"
              >
                LINEで友だち追加
              </a>
            </div>
          )}
        </div>
        <p className="mt-6 text-xs text-faint">
          このページは閉じていただいて構いません。
        </p>
      </div>
    </main>
  );
}
