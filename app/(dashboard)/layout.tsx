import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/helper/lib/auth";
import {
  getActiveShopId,
  listBrandShops,
} from "@/helper/lib/shop-context";
import { TopNav } from "@/components/layout/TopNav";
import { ShopSelector } from "@/components/layout/ShopSelector";
import { UserMenu } from "@/components/layout/UserMenu";
import { NotificationBell } from "@/feature/notification/components/NotificationBell";
import { getNotifications } from "@/feature/notification/services/getNotifications";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [shops, activeShopId] = await Promise.all([
    listBrandShops(),
    getActiveShopId(),
  ]);
  // 通知テーブルが本番DBに未適用でもヘッダーごと落とさない（空の通知で描画）。
  const notifications = await getNotifications(activeShopId).catch(() => ({
    items: [],
    unread: 0,
  }));

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-line bg-base/85 backdrop-blur">
        {/* スマホはロゴ・店舗セレクタを詰めて、店舗名 + 通知ベル + ログアウトが
            横スクロールせずに収まるようにする（sm 以上は従来どおり）。
            注意: 16px のフォントサイズは `text-base` ではなく `text-md`
            （tailwind.config.ts のコメント参照）。 */}
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:gap-6 sm:px-6">
          <Link
            href="/reservation"
            className="shrink-0 font-display text-md tracking-[0.1em] text-accent sm:text-xl sm:tracking-[0.18em]"
          >
            Dreamland
          </Link>
          <div className="hidden sm:block">
            <TopNav />
          </div>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <ShopSelector shops={shops} activeShopId={activeShopId} />
            <NotificationBell initial={notifications} />
            <UserMenu name={user.name} />
          </div>
        </div>
        <div className="no-scrollbar overflow-x-auto border-t border-line px-4 py-2 sm:hidden">
          <TopNav />
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
