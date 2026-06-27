import { z } from "zod";

// z.coerce.boolean() は "false" 等の非空文字列も true にしてしまうため使わない。
// チェックボックス由来の値（"on"/"true"/true/"1"）だけを true とみなす。
const boolish = z.preprocess(
  (v) => v === true || v === "true" || v === "on" || v === "1",
  z.boolean(),
);

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
  // 消費税率は 標準10% / 軽減8% / 非課税0% のみ許可
  taxRate: z.coerce
    .number()
    .int()
    .refine((v) => v === 0 || v === 8 || v === 10, "税率は0/8/10%のいずれかです")
    .optional()
    .default(10),
  // 改行区切りの画像URL（フォーム入力）→ action 側で JSON 配列に変換
  imageUrlsText: z.string().trim().max(4000).optional().nullable(),
  isPublic: boolish.optional().default(true),
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
  storeActive: boolish.optional().default(false),
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
  freeShippingThreshold: z.coerce
    .number()
    .int()
    .min(0)
    .max(10_000_000)
    .optional()
    .default(0),
  pointRatePercent: z.coerce.number().int().min(0).max(100).optional().default(0),
});

export const legalInfoSchema = z.object({
  sellerName: z.string().trim().max(120).optional().nullable(),
  manager: z.string().trim().max(80).optional().nullable(),
  address: z.string().trim().max(200).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  email: z.string().trim().max(120).optional().nullable(),
  hours: z.string().trim().max(120).optional().nullable(),
  extraFees: z.string().trim().max(300).optional().nullable(),
  paymentMethods: z.string().trim().max(200).optional().nullable(),
  deliveryTime: z.string().trim().max(200).optional().nullable(),
  returnPolicy: z.string().trim().max(1000).optional().nullable(),
});

export type LegalInfo = z.infer<typeof legalInfoSchema>;
