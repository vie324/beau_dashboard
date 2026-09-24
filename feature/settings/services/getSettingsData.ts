import { db } from "@/helper/lib/db";
import { getNotifySupport } from "@/helper/lib/schemaSupport";

/** Master data for the settings screen, scoped to the active brand/shop. */
export async function getSettingsData(brandId: number, shopId: number) {
  // 通知設定の列は本番DBへ手動マイグレーションを流すまで存在しない。
  // 無いまま SELECT すると P2022 で設定ページ全体が開けなくなるため、
  // 先に存在確認し、無ければ通知設定の読み込みごとスキップする。
  const notifySupport = await getNotifySupport();

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
        // 対応スタッフ（空 = 全スタッフ対応）。全店舗共通メニューは他店舗の
        // スタッフも含むので、画面側で表示中の店舗のスタッフに絞り込む。
        staffLinks: { select: { staffId: true } },
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

  // 通知設定は別クエリにする。列が無い環境ではこのクエリを丸ごと飛ばせるので、
  // 上の店舗一覧（設定ページの主役）は DDL 未適用でも必ず読める。
  const notifyByShopId = new Map<
    number,
    { notifyEmail: string | null; notifyManualBooking: boolean }
  >();
  if (notifySupport.columns) {
    const rows = await db.shop.findMany({
      where: { brandId, deletedAt: null },
      select: { id: true, notifyEmail: true, notifyManualBooking: true },
    });
    for (const r of rows) {
      notifyByShopId.set(r.id, {
        notifyEmail: r.notifyEmail,
        notifyManualBooking: r.notifyManualBooking,
      });
    }
  }

  return {
    // 列が無いときも画面側の型を揃えるため、既定値を補って返す。
    shops: shops.map((s) => ({
      ...s,
      ...(notifyByShopId.get(s.id) ?? {
        notifyEmail: null,
        notifyManualBooking: false,
      }),
    })),
    staffs,
    equipments,
    menus,
    visitSources,
    cardColorPresets,
    /** 通知機能の DDL が本番DBに適用済みか（未適用なら設定画面で案内を出す） */
    notifyReady: notifySupport.ready,
  };
}

export type SettingsData = Awaited<ReturnType<typeof getSettingsData>>;
export type ShopRow = SettingsData["shops"][number];
export type StaffRow = SettingsData["staffs"][number];
export type EquipmentRow = SettingsData["equipments"][number];
export type MenuRow = SettingsData["menus"][number];
export type VisitSourceRow = SettingsData["visitSources"][number];
export type CardColorPresetRow = SettingsData["cardColorPresets"][number];
