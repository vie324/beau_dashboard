import { PageHeader } from "@/components/layout/PageHeader";
import { db } from "@/helper/lib/db";
import { getActiveBrandId } from "@/helper/lib/shop-context";
import { getBookingLinks } from "@/feature/booking-link/services/getBookingLinks";
import { BookingLinkList } from "@/feature/booking-link/components/BookingLinkList";

export const dynamic = "force-dynamic";

export default async function BookingLinksPage() {
  const brandId = await getActiveBrandId();

  const shops = await db.shop.findMany({
    where: { brandId, deletedAt: null },
    orderBy: [{ sortNumber: "asc" }, { id: "asc" }],
    select: { id: true, name: true },
  });
  const shopIds = shops.map((s) => s.id);

  const [links, menus] = await Promise.all([
    getBookingLinks(brandId),
    db.menu.findMany({
      where: {
        deletedAt: null,
        OR: [{ shopId: null }, { shopId: { in: shopIds } }],
      },
      orderBy: [{ sortNumber: "asc" }, { id: "asc" }],
      select: { id: true, name: true },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="強制リンク"
        description="公開予約ページ（/book/&lt;slug&gt;）を発行します。slug ごとに対象店舗・予約可能メニュー・リマインドを制御できます。"
      />
      <BookingLinkList links={links} shops={shops} menus={menus} />
    </>
  );
}
