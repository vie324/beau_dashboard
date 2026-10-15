import { LeafIcon } from "@/feature/storefront/components/icons";

export function StoreFooter({
  slug,
  shopName,
  title,
  address,
  phone,
}: {
  slug: string;
  shopName: string;
  title: string;
  address?: string | null;
  phone?: string | null;
}) {
  const links = [
    { href: `/shop/${slug}`, label: "ストアトップ" },
    { href: `/shop/${slug}#products`, label: "商品一覧" },
    { href: `/shop/${slug}/member`, label: "マイページ（ポイント・ご注文履歴）" },
    { href: `/shop/${slug}/legal`, label: "特定商取引法に基づく表記" },
  ];
  return (
    <footer className="relative mt-8 overflow-hidden border-t border-line bg-elevated/50">
      <LeafIcon
        size={220}
        strokeWidth={0.6}
        className="pointer-events-none absolute -right-10 -top-6 text-accent/10"
      />
      <div className="relative mx-auto grid max-w-6xl gap-10 px-6 py-14 sm:grid-cols-[1.3fr_1fr] sm:px-8">
        <div>
          <p className="font-accent text-sm italic tracking-[0.3em] text-accent">
            Online Store
          </p>
          <p className="mt-2 font-display text-xl tracking-[0.12em] text-ink">{title}</p>
          <div className="mt-4 space-y-0.5 text-xs leading-relaxed text-muted">
            <div>{shopName}</div>
            {address && <div>{address}</div>}
            {phone && <div>TEL: {phone}</div>}
          </div>
        </div>
        <nav aria-label="フッター">
          <ul className="space-y-2.5 text-sm">
            {links.map((l) => (
              <li key={l.href}>
                <a
                  href={l.href}
                  className="text-muted underline-offset-4 transition-colors hover:text-accent hover:underline"
                >
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <p className="relative border-t border-line/70 pb-24 pt-4 text-center font-accent text-xs tracking-[0.2em] text-faint md:pb-4">
        Powered by Beau
      </p>
    </footer>
  );
}
