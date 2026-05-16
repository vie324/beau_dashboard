import { db } from "@/helper/lib/db";

/** Master data for the settings screen, scoped to the active brand/shop. */
export async function getSettingsData(brandId: number, shopId: number) {
  const [shops, staffs, menus] = await Promise.all([
    db.shop.findMany({
      where: { brandId, deletedAt: null },
      orderBy: [{ sortNumber: "asc" }, { id: "asc" }],
      select: {
        id: true,
        name: true,
        sortNumber: true,
        address: true,
        phone: true,
        lineUrl: true,
      },
    }),
    db.staff.findMany({
      where: { shopId, deletedAt: null },
      orderBy: [{ allocateOrder: "asc" }, { id: "asc" }],
      select: {
        id: true,
        name: true,
        color: true,
        allocateOrder: true,
        isBookable: true,
      },
    }),
    db.menu.findMany({
      where: { deletedAt: null, OR: [{ shopId: null }, { shopId }] },
      orderBy: [{ sortNumber: "asc" }, { id: "asc" }],
      select: {
        id: true,
        name: true,
        durationMin: true,
        price: true,
        isPublic: true,
        sortNumber: true,
        shopId: true,
      },
    }),
  ]);

  return { shops, staffs, menus };
}

export type SettingsData = Awaited<ReturnType<typeof getSettingsData>>;
export type ShopRow = SettingsData["shops"][number];
export type StaffRow = SettingsData["staffs"][number];
export type MenuRow = SettingsData["menus"][number];
