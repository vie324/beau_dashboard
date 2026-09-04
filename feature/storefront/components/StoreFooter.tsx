export function StoreFooter({
  slug,
  shopName,
  address,
  phone,
}: {
  slug: string;
  shopName: string;
  address?: string | null;
  phone?: string | null;
}) {
  return (
    <footer className="mt-14 border-t border-line pt-6 text-center">
      <div className="flex flex-wrap justify-center gap-x-5 gap-y-1 text-xs text-muted">
        <a href={`/shop/${slug}`} className="hover:text-accent">
          ストアトップ
        </a>
        <a href={`/shop/${slug}/member`} className="hover:text-accent">
          マイページ（ポイント・ご注文履歴）
        </a>
        <a href={`/shop/${slug}/legal`} className="hover:text-accent">
          特定商取引法に基づく表記
        </a>
      </div>
      <div className="mt-4 text-xs text-faint">
        <div className="font-medium text-muted">{shopName}</div>
        {address && <div className="mt-0.5">{address}</div>}
        {phone && <div className="mt-0.5">TEL: {phone}</div>}
      </div>
      <p className="mt-4 text-[10px] tracking-wider text-faint">Powered by Beau</p>
    </footer>
  );
}
