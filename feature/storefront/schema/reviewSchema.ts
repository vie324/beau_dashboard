import { z } from "zod";

export const reviewSchema = z.object({
  slug: z.string().trim().min(1),
  productId: z.coerce.number().int().positive(),
  authorName: z
    .string()
    .trim()
    .min(1, "お名前（ニックネーム可）を入力してください")
    .max(40),
  rating: z.coerce
    .number()
    .int()
    .min(1, "評価を選択してください")
    .max(5),
  title: z.string().trim().max(80).optional().nullable(),
  comment: z.string().trim().max(1000).optional().nullable(),
});

export type ReviewInput = z.infer<typeof reviewSchema>;
