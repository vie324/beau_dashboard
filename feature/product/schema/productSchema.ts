import { z } from "zod";

export const productSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  name: z
    .string()
    .trim()
    .min(1, "商品名を入力してください")
    .max(120, "商品名は120文字以内で入力してください"),
  sku: z.string().trim().max(60).optional().nullable(),
  categoryId: z.coerce.number().int().positive().optional().nullable(),
  description: z.string().trim().max(2000).optional().nullable(),
  price: z.coerce
    .number({ invalid_type_error: "価格は数値で入力してください" })
    .int("価格は整数で入力してください")
    .min(0, "価格は0以上で入力してください")
    .max(10_000_000),
  cost: z.coerce
    .number()
    .int()
    .min(0, "原価は0以上で入力してください")
    .max(10_000_000)
    .optional()
    .default(0),
  taxRate: z.coerce.number().int().min(0).max(20).optional().default(10),
  // 改行区切りの画像URL（フォーム入力）→ action 側で JSON 配列に変換
  imageUrlsText: z.string().trim().max(4000).optional().nullable(),
  isPublic: z.coerce.boolean().optional().default(true),
  // 新規作成時の初期在庫・発注点
  initialStock: z.coerce.number().int().min(0).max(1_000_000).optional(),
  safetyStock: z.coerce.number().int().min(0).max(1_000_000).optional(),
});

export type ProductInput = z.infer<typeof productSchema>;

export const categorySchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  name: z.string().trim().min(1, "カテゴリ名を入力してください").max(60),
  sortNumber: z.coerce.number().int().min(0).max(9999).optional().default(0),
});

export const stockAdjustSchema = z.object({
  productId: z.coerce.number().int().positive(),
  // in 入荷 / waste 廃棄 / adjust 棚卸調整（実数指定）
  type: z.enum(["in", "waste", "adjust"]),
  // in/waste は増減数（正の整数）、adjust は「調整後の実在庫数」
  amount: z.coerce.number().int().min(0).max(1_000_000),
  safetyStock: z.coerce.number().int().min(0).max(1_000_000).optional(),
  reason: z.string().trim().max(200).optional().nullable(),
});

export const storefrontSettingsSchema = z.object({
  storeActive: z.coerce.boolean().optional().default(false),
  storeSlug: z
    .string()
    .trim()
    .max(60)
    .regex(
      /^[a-z0-9-]*$/,
      "URLスラッグは半角英小文字・数字・ハイフンのみ使用できます",
    )
    .optional()
    .nullable(),
  storeTitle: z.string().trim().max(120).optional().nullable(),
  storeDescription: z.string().trim().max(1000).optional().nullable(),
  shippingFee: z.coerce.number().int().min(0).max(1_000_000).optional().default(0),
  pointRatePercent: z.coerce.number().int().min(0).max(100).optional().default(0),
});
