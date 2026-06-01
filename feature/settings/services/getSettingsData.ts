import { db } from "@/helper/lib/db";

/** Master data for the settings screen, scoped to the active brand/shop. */
export async function getSettingsData(brandId: number, shopId: number) {
  const [shops, staffs, equipments, menus, visitSources, cardColorPresets] = await Promise.all([
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
        openTime: true,
        closeTime: true,
        breakStart: true,
        breakEnd: true,
        hoursByDow: true,
        dateOverrides: true,
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
        spotMode: true,
        workDates: true,
      },
    }),
    db.equipment.findMany({
      where: { shopId, deletedAt: null },
      orderBy: [{ sortNumber: "asc" }, { id: "asc" }],
      select: {
        id: true,
        name: true,
        color: true,
        sortNumber: true,
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
        requiresStaff: true,
        equipmentId: true,
      },
    }),
    db.visitSource.findMany({
      where: { shopId, deletedAt: null },
      orderBy: [{ sortNumber: "asc" }, { id: "asc" }],
      select: { id: true, name: true, sortNumber: true },
    }),
    db.cardColorPreset.findMany({
      where: { shopId, deletedAt: null },
      orderBy: [{ sortNumber: "asc" }, { id: "asc" }],
      select: { id: true, name: true, hexColor: true, sortNumber: true },
    }),
  ]);

  return { shops, staffs, equipments, menus, visitSources, cardColorPresets };
}

export type SettingsData = Awaited<ReturnType<typeof getSettingsData>>;
export type ShopRow = SettingsData["shops"][number];
export type StaffRow = SettingsData["staffs"][number];
export type EquipmentRow = SettingsData["equipments"][number];
export type MenuRow = SettingsData["menus"][number];
export type VisitSourceRow = SettingsData["visitSources"][number];
export type CardColorPresetRow = SettingsData["cardColorPresets"][number];
