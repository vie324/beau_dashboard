"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/helper/lib/db";
import {
  reviewSchema,
  type ReviewInput,
} from "@/feature/storefront/schema/reviewSchema";

export type ReviewResult = { ok: true } | { ok: false; error: string };

/**
 * 公開ページからのレビュー投稿。店舗・商品が公開中であることをサーバ側で検証する。
 * 認証不要（toC）。スパム対策として文字数上限のみ。管理者が後から非表示/削除できる。
 */
export async function submitReview(input: ReviewInput): Promise<ReviewResult> {
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "入力内容を確認してください",
    };
  }
  const data = parsed.data;

  // 公開中の店舗・商品か検証（越境・非公開商品へのレビューを防止）
  const product = await db.product.findFirst({
    where: {
      id: data.productId,
      isPublic: true,
      deletedAt: null,
      shop: { storeSlug: data.slug, storeActive: true, deletedAt: null },
    },
    select: { id: true, shopId: true },
  });
  if (!product) {
    return { ok: false, error: "対象の商品が見つかりません" };
  }

  try {
    await db.productReview.create({
      data: {
        shopId: product.shopId,
        productId: product.id,
        authorName: data.authorName,
        rating: data.rating,
        title: data.title ?? null,
        comment: data.comment ?? null,
      },
    });
  } catch {
    return { ok: false, error: "投稿に失敗しました。時間をおいて再度お試しください" };
  }

  revalidatePath(`/shop/${data.slug}/item/${data.productId}`);
  revalidatePath(`/shop/${data.slug}`);
  return { ok: true };
}
