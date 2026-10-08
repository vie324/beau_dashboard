"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/helper/lib/db";
import { getCurrentUser } from "@/helper/lib/auth";
import { getActiveBrandId } from "@/helper/lib/shop-context";
import { getBookingScheduleSupport } from "@/helper/lib/schemaSupport";
import { bookingLinkSchema } from "@/feature/booking-link/schema/bookingLinkSchema";
import { serializeSchedule } from "@/feature/booking-link/lib/schedule";

export type ActionResult = { ok: true } | { ok: false; error: string };

function readForm(formData: FormData) {
  let allowedMenuIds: number[] = [];
  try {
    const raw = formData.get("allowedMenuIds");
    if (typeof raw === "string" && raw) {
      const v = JSON.parse(raw);
      if (Array.isArray(v)) allowedMenuIds = v.map(Number);
    }
  } catch {
    allowedMenuIds = [];
  }

  // 受付する日時（JSON）。送られてこない = 変更しない（古い画面からの保存で
  // 既存の制限を消さないため）。読めない値は null にして検証エラーにする。
  let schedule: unknown = undefined;
  const rawSchedule = formData.get("schedule");
  if (typeof rawSchedule === "string") {
    try {
      schedule = JSON.parse(rawSchedule);
    } catch {
      schedule = null;
    }
  }

  return {
    id: formData.get("id") ? Number(formData.get("id")) : undefined,
    slug: String(formData.get("slug") ?? ""),
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? "") || undefined,
    shopId: formData.get("shopId")
      ? Number(formData.get("shopId"))
      : undefined,
    isActive: formData.get("isActive") === "true",
    requireStaffSelection: formData.get("requireStaffSelection") === "true",
    allowOverflowAtBreak:
      (formData.get("allowOverflowAtBreak") ?? "true") === "true",
    allowOverflowAtClose:
      (formData.get("allowOverflowAtClose") ?? "true") === "true",
    allowedMenuIds,
    intervalMin: Number(formData.get("intervalMin") ?? 30),
    reminderEnabled: formData.get("reminderEnabled") === "true",
    reminderHoursBefore: Number(formData.get("reminderHoursBefore") ?? 24),
    schedule,
  };
}

export async function saveBookingLink(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await getCurrentUser())) return { ok: false, error: "未認証です" };

  const parsed = bookingLinkSchema.safeParse(readForm(formData));
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "入力内容を確認してください",
    };
  }
  const input = parsed.data;
  const brandId = await getActiveBrandId();

  const clash = await db.bookingLink.findFirst({
    where: {
      slug: input.slug,
      deletedAt: null,
      ...(input.id ? { id: { not: input.id } } : {}),
    },
    select: { id: true },
  });
  if (clash) {
    return { ok: false, error: `slug「${input.slug}」は既に使われています` };
  }

  // 対象店舗はこのブランドの店舗に限る（他ブランド・削除済みだと公開ページが空になる）。
  if (input.shopId) {
    const shop = await db.shop.findFirst({
      where: { id: input.shopId, brandId, deletedAt: null },
      select: { id: true },
    });
    if (!shop) return { ok: false, error: "対象店舗の指定が正しくありません" };
  }

  // 予約可能メニューは、公開ページで実際に出せるもの（未削除・公開・対象店舗で使える）
  // だけを保存する。削除済みメニューの ID が残ると、全部外したつもりでも
  // 「限定あり」のままになり、公開ページのメニューが空になってしまうため。
  let allowedMenuIds: number[] = [];
  if (input.allowedMenuIds.length) {
    const brandShopIds = (
      await db.shop.findMany({
        where: { brandId, deletedAt: null },
        select: { id: true },
      })
    ).map((s) => s.id);
    const usable = await db.menu.findMany({
      where: {
        id: { in: input.allowedMenuIds },
        deletedAt: null,
        isPublic: true,
        OR: [
          { shopId: null },
          { shopId: { in: input.shopId ? [input.shopId] : brandShopIds } },
        ],
      },
      select: { id: true },
    });
    const ok = new Set(usable.map((m) => m.id));
    allowedMenuIds = [...new Set(input.allowedMenuIds)].filter((id) => ok.has(id));
    if (allowedMenuIds.length === 0) {
      return {
        ok: false,
        error:
          "選んだメニューはこのリンクでは予約できません（非公開・削除済み・他店舗のメニュー）。選び直すか、すべて外して「公開メニューすべて」にしてください",
      };
    }
  }

  // 受付する日時。列が無い（DDL 未適用）のに制限を保存しようとしたら、黙って
  // 捨てると「限定のつもりのリンクが無制限で公開される」ので保存自体を止める。
  const scheduleSupported = await getBookingScheduleSupport();
  let scheduleData: { schedule?: string | null } = {};
  if (input.schedule) {
    const json = serializeSchedule(input.schedule);
    if (scheduleSupported) {
      scheduleData = { schedule: json };
    } else if (json) {
      return {
        ok: false,
        error:
          "「受付する日時」の制限を保存するにはデータベースの更新が必要です。管理者に prisma/manual-migrations.sql の適用を依頼してください",
      };
    }
  }

  const data = {
    brandId,
    shopId: input.shopId ?? null,
    slug: input.slug,
    name: input.name,
    description: input.description ?? null,
    isActive: input.isActive,
    requireStaffSelection: input.requireStaffSelection,
    allowOverflowAtBreak: input.allowOverflowAtBreak,
    allowOverflowAtClose: input.allowOverflowAtClose,
    intervalMin: input.intervalMin,
    allowedMenuIds: JSON.stringify(allowedMenuIds),
    reminderSettings: JSON.stringify({
      enabled: input.reminderEnabled,
      hoursBefore: input.reminderHoursBefore,
    }),
    ...scheduleData,
  };

  try {
    if (input.id) {
      const existing = await db.bookingLink.findFirst({
        where: { id: input.id, brandId, deletedAt: null },
        select: { id: true },
      });
      if (!existing) return { ok: false, error: "リンクが見つかりません" };
      await db.bookingLink.update({
        where: { id: input.id },
        data,
        select: { id: true },
      });
    } else {
      await db.bookingLink.create({ data, select: { id: true } });
    }
  } catch (e) {
    if (
      e &&
      typeof e === "object" &&
      "code" in e &&
      (e as { code?: string }).code === "P2002"
    ) {
      return { ok: false, error: `slug「${input.slug}」は既に使われています` };
    }
    return { ok: false, error: "保存に失敗しました。時間をおいて再度お試しください" };
  }

  revalidatePath("/booking-links");
  return { ok: true };
}

export async function toggleBookingLink(
  id: number,
  isActive: boolean,
): Promise<ActionResult> {
  if (!(await getCurrentUser())) return { ok: false, error: "未認証です" };
  const brandId = await getActiveBrandId();
  const existing = await db.bookingLink.findFirst({
    where: { id, brandId, deletedAt: null },
    select: { id: true },
  });
  if (!existing) return { ok: false, error: "リンクが見つかりません" };

  try {
    await db.bookingLink.update({
      where: { id },
      data: { isActive },
      select: { id: true },
    });
  } catch {
    return { ok: false, error: "状態の変更に失敗しました" };
  }
  revalidatePath("/booking-links");
  return { ok: true };
}

export async function deleteBookingLink(id: number): Promise<ActionResult> {
  if (!(await getCurrentUser())) return { ok: false, error: "未認証です" };
  const brandId = await getActiveBrandId();
  const existing = await db.bookingLink.findFirst({
    where: { id, brandId, deletedAt: null },
    select: { id: true },
  });
  if (!existing) return { ok: false, error: "リンクが見つかりません" };

  try {
    await db.bookingLink.update({
      where: { id },
      data: { deletedAt: new Date() },
      select: { id: true },
    });
  } catch {
    return { ok: false, error: "削除に失敗しました" };
  }
  revalidatePath("/booking-links");
  return { ok: true };
}
