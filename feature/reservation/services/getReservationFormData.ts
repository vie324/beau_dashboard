import { db } from "@/helper/lib/db";
import { compareByCustomerCode } from "@/helper/utils/customerSort";

/** Master data needed to render the appointment form for a shop. */
export async function getReservationFormData(shopId: number) {
  const [staffs, equipments, menus, customers, visitSources, cardColorPresets] = await Promise.all([
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
        // 対応スタッフ（空 = 全員対応）。予約モーダルで対象外の担当を選んだ
        // ときに注意書きを出すために使う。
        staffLinks: { select: { staffId: true } },
      },
    }),
    db.customer.findMany({
      where: { shopId, deletedAt: null },
      select: { id: true, code: true, name: true, kana: true, phone: true },
    }),
    db.visitSource.findMany({
      where: { shopId, deletedAt: null },
      orderBy: [{ sortNumber: "asc" }, { id: "asc" }],
      select: { id: true, name: true },
    }),
    db.cardColorPreset.findMany({
      where: { shopId, deletedAt: null },
      orderBy: [{ sortNumber: "asc" }, { id: "asc" }],
      select: { id: true, name: true, hexColor: true },
    }),
  ]);

  customers.sort(compareByCustomerCode);

  return { staffs, equipments, menus, customers, visitSources, cardColorPresets };
}
