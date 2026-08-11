import { db } from "@/helper/lib/db";

export type PublicBookingData = {
  link: {
    id: number;
    slug: string;
    name: string;
    description: string | null;
    requireStaffSelection: boolean;
    intervalMin: number;
  };
  shops: { id: number; name: string }[];
  menus: {
    id: number;
    name: string;
    durationMin: number;
    price: number;
    // 対応スタッフのID（空 = 全スタッフ対応）。店舗ごとの絞り込みは
    // helper/utils/menuStaff の capableStaffIds で行う。
    staffIds: number[];
  }[];
  staffsByShop: Record<number, { id: number; name: string }[]>;
};

function parseMenuIds(raw: string | null): number[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(Number).filter(Number.isInteger) : [];
  } catch {
    return [];
  }
}

export async function getBookingLinkBySlug(
  slug: string,
): Promise<PublicBookingData | null> {
  const link = await db.bookingLink.findFirst({
    where: { slug, isActive: true, deletedAt: null },
  });
  if (!link) return null;

  // Resolve shops: a fixed shop, or every shop in the brand.
  const shops = await db.shop.findMany({
    where: {
      deletedAt: null,
      brandId: link.brandId,
      ...(link.shopId ? { id: link.shopId } : {}),
    },
    orderBy: [{ sortNumber: "asc" }, { id: "asc" }],
    select: { id: true, name: true },
  });
  const shopIds = shops.map((s) => s.id);

  const allowed = parseMenuIds(link.allowedMenuIds);
  const menus = await db.menu.findMany({
    where: {
      deletedAt: null,
      isPublic: true,
      OR: [{ shopId: null }, { shopId: { in: shopIds } }],
      ...(allowed.length ? { id: { in: allowed } } : {}),
    },
    orderBy: [{ sortNumber: "asc" }, { id: "asc" }],
    select: {
      id: true,
      name: true,
      durationMin: true,
      price: true,
      staffLinks: { select: { staffId: true } },
    },
  });

  const staffsByShop: Record<number, { id: number; name: string }[]> = {};
  if (link.requireStaffSelection && shopIds.length) {
    const staffs = await db.staff.findMany({
      where: {
        shopId: { in: shopIds },
        deletedAt: null,
        isBookable: true,
      },
      orderBy: [{ allocateOrder: "asc" }, { id: "asc" }],
      select: { id: true, name: true, shopId: true },
    });
    for (const s of staffs) {
      (staffsByShop[s.shopId] ??= []).push({ id: s.id, name: s.name });
    }
  }

  return {
    link: {
      id: link.id,
      slug: link.slug,
      name: link.name,
      description: link.description,
      requireStaffSelection: link.requireStaffSelection,
      intervalMin: link.intervalMin,
    },
    shops,
    menus: menus.map((m) => ({
      id: m.id,
      name: m.name,
      durationMin: m.durationMin,
      price: m.price,
      staffIds: m.staffLinks.map((l) => l.staffId),
    })),
    staffsByShop,
  };
}
