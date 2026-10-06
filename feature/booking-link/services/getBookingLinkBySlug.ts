import { db } from "@/helper/lib/db";
import { capableStaffIds } from "@/helper/utils/menuStaff";
import { toLocalDateString } from "@/helper/utils/time";
import {
  findPublicLink,
  getLinkStatus,
  type LinkStatus,
} from "@/feature/booking-link/lib/linkDb";
import { publicScheduleNotices } from "@/feature/booking-link/lib/schedule";

export type PublicBookingData = {
  link: {
    id: number;
    slug: string;
    name: string;
    description: string | null;
    requireStaffSelection: boolean;
    intervalMin: number;
    /** grid = 週間の ◎/× 表、slots = 日付ごとの枠ボタン（枠限定） */
    layout: "grid" | "slots";
  };
  /** 受付状況。open 以外は message を表示してフォームは出さない */
  status: Pick<LinkStatus, "state" | "message">;
  /** お客様向けの案内（受付できる期間・締切・先着 等）。制限なしなら空 */
  notices: string[];
  shops: { id: number; name: string }[];
  menus: {
    id: number;
    name: string;
    durationMin: number;
    price: number;
    // メニューの店舗（null = 全店舗共通）。店舗を選べるリンクでは、選んだ店舗の
    // メニューだけを出すのに使う。
    shopId: number | null;
    // スタッフが必要なメニューか（false = 設備のみ。指名は使わない）
    requiresStaff: boolean;
    // 店舗ごとの「このメニューを担当できる予約可能スタッフ」のID（指名必須のリンクのみ）。
    // 対応スタッフの判定は予約登録と同じ基準でサーバー側で済ませておく。
    capableStaffIdsByShop: Record<number, number[]>;
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
  const link = await findPublicLink(slug);
  if (!link) return null;

  const nowMs = Date.now();
  const status = await getLinkStatus(link, nowMs);
  const base = {
    link: {
      id: link.id,
      slug: link.slug,
      name: link.name,
      description: link.description,
      requireStaffSelection: link.requireStaffSelection,
      intervalMin: link.intervalMin,
      layout:
        link.schedule.mode === "slots" ? ("slots" as const) : ("grid" as const),
    },
    status: { state: status.state, message: status.message },
    notices:
      status.state === "open"
        ? publicScheduleNotices(
            link.schedule,
            toLocalDateString(new Date(nowMs)),
            { remaining: status.remaining },
          )
        : [],
  };
  // 受付していないときはフォームを出さないので、メニュー等は読まない。
  if (status.state !== "open") {
    return { ...base, shops: [], menus: [], staffsByShop: {} };
  }

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
      shopId: true,
      requiresStaff: true,
      staffLinks: { select: { staffId: true } },
    },
  });

  const staffsByShop: Record<number, { id: number; name: string }[]> = {};
  // 対応スタッフの制限は在籍スタッフ全員（予約受付の対象外も含む）で判定する
  const allStaffIdsByShop: Record<number, number[]> = {};
  if (link.requireStaffSelection && shopIds.length) {
    const staffs = await db.staff.findMany({
      where: { shopId: { in: shopIds }, deletedAt: null },
      orderBy: [{ allocateOrder: "asc" }, { id: "asc" }],
      select: { id: true, name: true, shopId: true, isBookable: true },
    });
    for (const s of staffs) {
      (allStaffIdsByShop[s.shopId] ??= []).push(s.id);
      if (s.isBookable) {
        (staffsByShop[s.shopId] ??= []).push({ id: s.id, name: s.name });
      }
    }
  }

  return {
    ...base,
    shops,
    menus: menus.map((m) => ({
      id: m.id,
      name: m.name,
      durationMin: m.durationMin,
      price: m.price,
      shopId: m.shopId,
      requiresStaff: m.requiresStaff,
      capableStaffIdsByShop: Object.fromEntries(
        shopIds.map((sid) => {
          const capable = new Set(
            capableStaffIds(
              allStaffIdsByShop[sid] ?? [],
              m.staffLinks.map((l) => l.staffId),
            ),
          );
          return [
            sid,
            (staffsByShop[sid] ?? []).filter((x) => capable.has(x.id)).map((x) => x.id),
          ];
        }),
      ),
    })),
    staffsByShop,
  };
}
