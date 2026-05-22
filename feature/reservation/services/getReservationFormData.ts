import { db } from "@/helper/lib/db";

/** Master data needed to render the appointment form for a shop. */
export async function getReservationFormData(shopId: number) {
  const [staffs, equipments, menus, customers, visitSources] = await Promise.all([
    db.staff.findMany({
      where: { shopId, deletedAt: null, isBookable: true },
      orderBy: [{ allocateOrder: "asc" }, { id: "asc" }],
      select: {
        id: true,
        name: true,
        color: true,
        spotMode: true,
        workDates: true,
      },
    }),
    db.equipment.findMany({
      where: { shopId, deletedAt: null, isBookable: true },
      orderBy: [{ sortNumber: "asc" }, { id: "asc" }],
      select: { id: true, name: true, color: true },
    }),
    // Hybrid: brand-common (shopId null) OR this shop.
    db.menu.findMany({
      where: {
        deletedAt: null,
        OR: [{ shopId: null }, { shopId }],
      },
      orderBy: [{ sortNumber: "asc" }, { id: "asc" }],
      select: {
        id: true,
        name: true,
        durationMin: true,
        price: true,
        menuManageId: true,
        requiresStaff: true,
        equipmentId: true,
      },
    }),
    db.customer.findMany({
      where: { shopId, deletedAt: null },
      orderBy: [{ kana: "asc" }, { name: "asc" }, { id: "asc" }],
      select: { id: true, code: true, name: true, kana: true, phone: true },
    }),
    db.visitSource.findMany({
      where: { shopId, deletedAt: null },
      orderBy: [{ sortNumber: "asc" }, { id: "asc" }],
      select: { id: true, name: true },
    }),
  ]);

  return { staffs, equipments, menus, customers, visitSources };
}
