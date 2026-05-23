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

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-line bg-base/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6">
          <Link
            href="/reservation"
            className="font-display text-xl tracking-[0.18em] text-accent"
          >
            Dreamland
          </Link>
          <div className="hidden sm:block">
            <TopNav />
          </div>
          <div className="ml-auto flex items-center gap-3">
            <ShopSelector shops={shops} activeShopId={activeShopId} />
            <UserMenu name={user.name} />
          </div>
        </div>
        <div className="border-t border-line px-4 py-2 sm:hidden">
          <TopNav />
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
