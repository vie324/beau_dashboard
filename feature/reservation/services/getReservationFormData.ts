import { db } from "@/helper/lib/db";

/** Master data needed to render the appointment form for a shop. */
export async function getReservationFormData(shopId: number) {
  const [staffs, menus, customers, visitSources] = await Promise.all([
    db.staff.findMany({
      where: { shopId, deletedAt: null, isBookable: true },
      orderBy: [{ allocateOrder: "asc" }, { id: "asc" }],
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
      },
    }),
    db.customer.findMany({
      where: { shopId, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, phone: true },
    }),
    db.visitSource.findMany({
      where: { shopId, deletedAt: null },
      orderBy: [{ sortNumber: "asc" }, { id: "asc" }],
      select: { id: true, name: true },
    }),
  ]);

  return { staffs, menus, customers, visitSources };
}
