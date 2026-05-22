"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/helper/lib/db";
import { getActiveBrandId } from "@/helper/lib/shop-context";
import { getCurrentUser } from "@/helper/lib/auth";

const rowSchema = z.object({
  code: z.string().trim().max(60).nullable().optional(),
  name: z.string().trim().min(1).max(80),
  kana: z.string().trim().max(80).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  email: z.string().trim().max(120).nullable().optional(),
  postalCode: z.string().trim().max(16).nullable().optional(),
  address: z.string().trim().max(200).nullable().optional(),
  gender: z.string().trim().max(16).nullable().optional(),
  birthday: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
});

export type ImportRow = z.input<typeof rowSchema>;

export type ImportChunkResult =
  | { ok: true; created: number; updated: number; skipped: number }
  | { ok: false; error: string };

const MAX_CHUNK = 500;

function toDate(birthday: string | null | undefined): Date | null {
  if (!birthday) return null;
  const [y, m, d] = birthday.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/**
 * CSV 1 チャンク分の顧客を取り込む。code（患者番号）があれば店舗内で upsert、
 * 無ければ新規作成。soft-delete 済みの同 code は復活させて更新する。
 */
export async function importCustomersChunk(
  shopId: number,
  rows: ImportRow[],
): Promise<ImportChunkResult> {
  if (!(await getCurrentUser())) return { ok: false, error: "未認証です" };
  if (!Number.isInteger(shopId)) {
    return { ok: false, error: "店舗の指定が正しくありません" };
  }
  if (rows.length > MAX_CHUNK) {
    return { ok: false, error: "一度に取り込める件数を超えています" };
  }

  // 対象店舗がログインユーザーのブランドに属するか検証。
  const brandId = await getActiveBrandId();
  const shop = await db.shop.findFirst({
    where: { id: shopId, brandId, deletedAt: null },
    select: { id: true },
  });
  if (!shop) return { ok: false, error: "対象店舗が見つかりません" };

  let created = 0;
  let updated = 0;
  let skipped = 0;

  const valid: z.infer<typeof rowSchema>[] = [];
  for (const r of rows) {
    const p = rowSchema.safeParse(r);
    if (p.success) valid.push(p.data);
    else skipped++;
  }

  // code 付きは事前に既存を引いて新規/更新を振り分け（createMany でまとめて作成）。
  const withCode = valid.filter((r) => r.code);
  const noCode = valid.filter((r) => !r.code);

  const codes = withCode.map((r) => r.code as string);
  const existing = codes.length
    ? await db.customer.findMany({
        where: { shopId, code: { in: codes } },
        select: { id: true, code: true },
      })
    : [];
  const idByCode = new Map(existing.map((e) => [e.code as string, e.id]));

  const toCreate = withCode.filter((r) => !idByCode.has(r.code as string));
  const toUpdate = withCode.filter((r) => idByCode.has(r.code as string));

  const buildData = (r: z.infer<typeof rowSchema>) => ({
    code: r.code ?? null,
    name: r.name,
    kana: r.kana ?? null,
    phone: r.phone ?? null,
    email: r.email ?? null,
    postalCode: r.postalCode ?? null,
    address: r.address ?? null,
    gender: r.gender ?? null,
    birthday: toDate(r.birthday),
  });

  try {
    if (toCreate.length || noCode.length) {
      const res = await db.customer.createMany({
        data: [...toCreate, ...noCode].map((r) => ({
          ...buildData(r),
          shopId,
        })),
      });
      created += res.count;
    }
    for (const r of toUpdate) {
      await db.customer.update({
        where: { id: idByCode.get(r.code as string)! },
        data: { ...buildData(r), deletedAt: null },
      });
      updated++;
    }
  } catch {
    return {
      ok: false,
      error: "取り込み中にエラーが発生しました。時間をおいて再度お試しください",
    };
  }

  revalidatePath("/customers");
  return { ok: true, created, updated, skipped };
}
