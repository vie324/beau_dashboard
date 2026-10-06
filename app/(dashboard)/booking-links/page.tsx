import { PageHeader } from "@/components/layout/PageHeader";
import { db } from "@/helper/lib/db";
import { getActiveBrandId } from "@/helper/lib/shop-context";
import { getBookingScheduleSupport } from "@/helper/lib/schemaSupport";
import { toLocalDateString } from "@/helper/utils/time";
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

  const [links, menus, scheduleSupported] = await Promise.all([
    getBookingLinks(brandId),
    db.menu.findMany({
      // 公開ページに出せるのは公開メニューだけなので、選択肢もそれに合わせる。
      where: {
        deletedAt: null,
        isPublic: true,
        OR: [{ shopId: null }, { shopId: { in: shopIds } }],
      },
      orderBy: [{ sortNumber: "asc" }, { id: "asc" }],
      select: { id: true, name: true, shopId: true },
    }),
    getBookingScheduleSupport(),
  ]);

  return (
    <>
      <PageHeader
        title="予約リンク"
        description="公開予約ページ（/book/&lt;slug&gt;）を発行します。slug ごとに対象店舗・予約可能メニュー・受付する日時（日付限定・期間限定・枠限定）・定員・リマインドを制御できます。"
      />
      <BookingLinkList
        links={links}
        shops={shops}
        menus={menus}
        scheduleSupported={scheduleSupported}
        today={toLocalDateString()}
      />
    </>
  );
}
