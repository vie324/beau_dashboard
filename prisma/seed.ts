import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

function todayJst(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function jstAt(dateStr: string, time: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh - 9, mm, 0, 0));
}

function plus(d: Date, min: number): Date {
  return new Date(d.getTime() + min * 60_000);
}

async function main() {
  // Idempotent: if the DB already has data (e.g. a redeploy on Vercel),
  // skip seeding so real reservations created in the app are preserved.
  const existing = await db.user.count();
  if (existing > 0) {
    console.log("Seed skipped — database already initialized.");
    return;
  }

  console.log("Seeding Beau …");

  // Clean — order matters for FKs (no-op on a fresh DB)
  await db.pointTransaction.deleteMany();
  await db.orderItem.deleteMany();
  await db.order.deleteMany();
  await db.stockMovement.deleteMany();
  await db.inventoryItem.deleteMany();
  await db.product.deleteMany();
  await db.productCategory.deleteMany();
  await db.appointment.deleteMany();
  await db.bookingLink.deleteMany();
  await db.menu.deleteMany();
  await db.menuCategory.deleteMany();
  await db.visitSource.deleteMany();
  await db.customer.deleteMany();
  await db.staff.deleteMany();
  await db.user.deleteMany();
  await db.shop.deleteMany();
  await db.brand.deleteMany();

  const brand = await db.brand.create({
    data: { name: "Beau", slug: "beau" },
  });

  const ginza = await db.shop.create({
    data: {
      brandId: brand.id,
      name: "Beau 銀座本店",
      sortNumber: 1,
      address: "東京都中央区銀座1-1-1",
      phone: "03-1234-5678",
      lineUrl: "https://line.me/R/ti/p/@beau-ginza",
      defaultBookingSlug: "beau",
      // 物販ストアフロント（公開販売ページ /shop/beau-ginza）
      storeActive: true,
      storeSlug: "beau-ginza",
      storeTitle: "Beau 銀座本店 物販ストア",
      storeDescription:
        "店頭でも人気のセルフケアグッズをオンラインでも。会員番号のご入力でポイントが貯まります。",
      shippingFee: 600,
      freeShippingThreshold: 5000,
      pointRatePercent: 5,
      legalInfo: JSON.stringify({
        sellerName: "Beau 銀座本店",
        manager: "佐藤 美咲",
        address: "〒104-0061 東京都中央区銀座1-1-1",
        phone: "03-1234-5678",
        email: "shop@beau-ginza.example.com",
        hours: "平日 10:00〜19:00（土日祝を除く）",
        paymentMethods: "クレジットカード決済（Stripe）",
        deliveryTime:
          "ご注文・ご入金確認後3〜5営業日以内に発送。店頭受取は翌営業日以降にご用意します。",
        returnPolicy:
          "商品到着後7日以内、未使用・未開封品に限り返品を承ります。不良品・誤発送の場合は当店負担で交換いたします。",
      }),
    },
  });

  const omotesando = await db.shop.create({
    data: {
      brandId: brand.id,
      name: "Beau 表参道店",
      sortNumber: 2,
      address: "東京都港区南青山3-2-1",
      phone: "03-9876-5432",
      defaultBookingSlug: "beau",
    },
  });

  await db.user.create({
    data: {
      brandId: brand.id,
      email: "admin@beau.test",
      passwordHash: await bcrypt.hash("beau1234", 10),
      name: "管理者",
      role: "brand",
    },
  });

  // Staff
  const ginzaStaff = await Promise.all(
    [
      { name: "佐藤 美咲", color: "#d8b06a", allocateOrder: 1 },
      { name: "田中 健太", color: "#6f9bd8", allocateOrder: 2 },
      { name: "鈴木 由香", color: "#5fb98a", allocateOrder: 3 },
    ].map((s) =>
      db.staff.create({ data: { ...s, shopId: ginza.id } }),
    ),
  );
  await Promise.all(
    [
      { name: "山本 涼", color: "#e0a64b", allocateOrder: 1 },
      { name: "中村 葵", color: "#b08bd8", allocateOrder: 2 },
    ].map((s) =>
      db.staff.create({ data: { ...s, shopId: omotesando.id } }),
    ),
  );

  // Visit sources (per shop) — default set
  for (const shopId of [ginza.id, omotesando.id]) {
    await db.visitSource.createMany({
      data: [
        { shopId, name: "紹介", color: "#1d3328", labelTextColor: "#5fb98a", sortNumber: 1 },
        { shopId, name: "meta", color: "#1d2a3a", labelTextColor: "#6f9bd8", sortNumber: 2 },
        { shopId, name: "チラシ", color: "#3a3119", labelTextColor: "#d8b06a", sortNumber: 3 },
        { shopId, name: "HP", color: "#33203a", labelTextColor: "#b08bd8", sortNumber: 4 },
      ],
    });
  }
  const ginzaSource = await db.visitSource.findFirst({
    where: { shopId: ginza.id, name: "Web予約" },
  });

  // Menu categories (brand-common: shopId null)
  const catBody = await db.menuCategory.create({
    data: { name: "ボディケア", sortNumber: 1 },
  });
  const catFacial = await db.menuCategory.create({
    data: { name: "フェイシャル", sortNumber: 2 },
  });
  const catHead = await db.menuCategory.create({
    data: { name: "ヘッドスパ", sortNumber: 3 },
  });

  const menus = await Promise.all([
    db.menu.create({
      data: {
        menuManageId: "BRD-BODY-60",
        name: "ボディケア 60分",
        categoryId: catBody.id,
        durationMin: 60,
        price: 8800,
        sortNumber: 1,
      },
    }),
    db.menu.create({
      data: {
        menuManageId: "BRD-BODY-90",
        name: "ボディケア 90分",
        categoryId: catBody.id,
        durationMin: 90,
        price: 12800,
        sortNumber: 2,
      },
    }),
    db.menu.create({
      data: {
        menuManageId: "BRD-FACE-60",
        name: "フェイシャル 60分",
        categoryId: catFacial.id,
        durationMin: 60,
        price: 11000,
        sortNumber: 3,
      },
    }),
    db.menu.create({
      data: {
        menuManageId: "BRD-HEAD-40",
        name: "ヘッドスパ 40分",
        categoryId: catHead.id,
        durationMin: 40,
        price: 6600,
        sortNumber: 4,
      },
    }),
    db.menu.create({
      data: {
        menuManageId: "STR-GINZA-VIP",
        name: "【銀座限定】VIPフルコース 120分",
        shopId: ginza.id,
        categoryId: catBody.id,
        durationMin: 120,
        price: 22000,
        sortNumber: 5,
      },
    }),
  ]);

  // Customers
  const customers = await Promise.all(
    [
      { name: "高橋 麻衣", kana: "タカハシ マイ", phone: "090-1111-2222" },
      { name: "渡辺 翔", kana: "ワタナベ ショウ", phone: "090-3333-4444" },
      { name: "伊藤 さくら", kana: "イトウ サクラ", phone: "090-5555-6666" },
    ].map((c) => db.customer.create({ data: { ...c, shopId: ginza.id } })),
  );

  // Booking link (brand-common: shopId null) — 予約リンク
  await db.bookingLink.create({
    data: {
      brandId: brand.id,
      shopId: null,
      slug: "beau",
      name: "公式予約ページ",
      description: "Beau の公式オンライン予約ページです。",
      isActive: true,
      requireStaffSelection: false,
      allowedMenuIds: JSON.stringify(menus.slice(0, 4).map((m) => m.id)),
      reminderSettings: JSON.stringify({ enabled: true, hoursBefore: 24 }),
    },
  });
  await db.bookingLink.create({
    data: {
      brandId: brand.id,
      shopId: ginza.id,
      slug: "ginza-vip",
      name: "銀座VIP限定枠",
      description: "銀座本店の VIP メニュー専用予約リンク。",
      isActive: true,
      requireStaffSelection: true,
      allowedMenuIds: JSON.stringify([menus[4].id]),
      reminderSettings: JSON.stringify({ enabled: false, hoursBefore: 24 }),
    },
  });

  // Appointments for today (Ginza)
  const today = todayJst();
  const a1Start = jstAt(today, "10:00");
  const a2Start = jstAt(today, "11:30");
  const a3Start = jstAt(today, "14:00");

  await db.appointment.create({
    data: {
      shopId: ginza.id,
      customerId: customers[0].id,
      staffId: ginzaStaff[0].id,
      menuId: menus[0].id,
      visitSourceId: ginzaSource?.id,
      startAt: a1Start,
      endAt: plus(a1Start, 60),
      status: 2,
      sales: 8800,
      source: "manual",
    },
  });
  await db.appointment.create({
    data: {
      shopId: ginza.id,
      customerId: customers[1].id,
      staffId: ginzaStaff[1].id,
      menuId: menus[2].id,
      visitSourceId: ginzaSource?.id,
      startAt: a2Start,
      endAt: plus(a2Start, 60),
      status: 1,
      source: "manual",
    },
  });
  await db.appointment.create({
    data: {
      shopId: ginza.id,
      customerId: customers[2].id,
      staffId: ginzaStaff[2].id,
      menuId: menus[1].id,
      visitSourceId: ginzaSource?.id,
      startAt: a3Start,
      endAt: plus(a3Start, 90),
      status: 0,
      source: "manual",
    },
  });

  // ---- 物販: カテゴリ・商品・在庫（銀座本店）----
  const pcSupport = await db.productCategory.create({
    data: { shopId: ginza.id, name: "サポーター・矯正", sortNumber: 1 },
  });
  const pcCare = await db.productCategory.create({
    data: { shopId: ginza.id, name: "セルフケア用品", sortNumber: 2 },
  });
  const pcSupple = await db.productCategory.create({
    data: { shopId: ginza.id, name: "サプリメント", sortNumber: 3 },
  });

  const productSeed: {
    name: string;
    sku: string;
    categoryId: number;
    price: number;
    cost: number;
    taxRate: number;
    description: string;
    stock: number;
    safety: number;
  }[] = [
    {
      name: "腰用サポーター（M）",
      sku: "SP-WAIST-M",
      categoryId: pcSupport.id,
      price: 3200,
      cost: 1400,
      taxRate: 10,
      description: "通気性の高いメッシュ素材。腰部をしっかり固定し、日常動作をサポートします。",
      stock: 24,
      safety: 5,
    },
    {
      name: "膝用サポーター（フリー）",
      sku: "SP-KNEE-F",
      categoryId: pcSupport.id,
      price: 2800,
      cost: 1200,
      taxRate: 10,
      description: "薄手で目立ちにくく、立ち仕事やスポーツ時の膝の負担を軽減します。",
      stock: 18,
      safety: 5,
    },
    {
      name: "オリジナル健康枕",
      sku: "CR-PILLOW",
      categoryId: pcCare.id,
      price: 6800,
      cost: 3000,
      taxRate: 10,
      description: "首・肩の負担を考えて設計した整体院監修の枕。高さ調整シート付き。",
      stock: 8,
      safety: 3,
    },
    {
      name: "フォームローラー",
      sku: "CR-ROLLER",
      categoryId: pcCare.id,
      price: 2400,
      cost: 900,
      taxRate: 10,
      description: "セルフ筋膜リリースに。お風呂上がりのケアにおすすめです。",
      stock: 3,
      safety: 5,
    },
    {
      name: "温熱サポートインソール",
      sku: "CR-INSOLE",
      categoryId: pcCare.id,
      price: 1800,
      cost: 700,
      taxRate: 10,
      description: "足裏アーチを支え、冷えやむくみが気になる方に。",
      stock: 30,
      safety: 8,
    },
    {
      name: "グルコサミン＆コンドロイチン（90粒）",
      sku: "SUP-GLUCO",
      categoryId: pcSupple.id,
      price: 3600,
      cost: 1500,
      taxRate: 8,
      description: "毎日の歩行をサポートする栄養補助食品。約30日分。",
      stock: 40,
      safety: 10,
    },
  ];

  for (const p of productSeed) {
    await db.product.create({
      data: {
        shopId: ginza.id,
        categoryId: p.categoryId,
        sku: p.sku,
        name: p.name,
        price: p.price,
        cost: p.cost,
        taxRate: p.taxRate,
        description: p.description,
        isPublic: true,
        inventory: {
          create: { shopId: ginza.id, quantity: p.stock, safetyStock: p.safety },
        },
        movements: {
          create: {
            shopId: ginza.id,
            type: "in",
            qty: p.stock,
            reason: "初期在庫",
          },
        },
      },
    });
  }

  console.log("Seed complete.");
  console.log("Login: admin@beau.test / beau1234");
  console.log("Storefront: /shop/beau-ginza");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
