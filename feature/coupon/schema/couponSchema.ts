import { z } from "zod";

// チェックボックス由来の値だけを true とみなす（"false" 文字列を true にしない）。
const boolish = z.preprocess(
  (v) => v === true || v === "true" || v === "on" || v === "1",
  z.boolean(),
);

const ymd = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "日付は YYYY-MM-DD 形式で入力してください");

export const couponSchema = z
  .object({
    id: z.coerce.number().int().positive().optional(),
    code: z
      .string()
      .trim()
      .min(1, "クーポンコードを入力してください")
      .max(40, "クーポンコードは40文字以内で入力してください")
      .regex(
        /^[A-Za-z0-9_-]+$/,
        "クーポンコードは半角英数字・ハイフン・アンダースコアのみ使用できます",
      ),
    name: z
      .string()
      .trim()
      .min(1, "クーポン名を入力してください")
      .max(80, "クーポン名は80文字以内で入力してください"),
    type: z.enum(["percent", "fixed"]),
    value: z.coerce
      .number({ invalid_type_error: "値引きの値を数値で入力してください" })
      .int("値引きの値は整数で入力してください")
      .min(1, "値引きの値を入力してください")
      .max(1_000_000),
    minSubtotal: z.coerce.number().int().min(0).max(10_000_000).optional().default(0),
    maxDiscount: z.coerce.number().int().min(0).max(10_000_000).optional().default(0),
    startsAt: ymd.optional().nullable(),
    expiresAt: ymd.optional().nullable(),
    usageLimit: z.coerce.number().int().min(1).max(1_000_000).optional().nullable(),
    isActive: boolish.optional().default(true),
    showOnStore: boolish.optional().default(false),
    note: z.string().trim().max(300).optional().nullable(),
  })
  .superRefine((v, ctx) => {
    if (v.type === "percent" && v.value > 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["value"],
        message: "％割引は100以下で入力してください",
      });
    }
    if (v.startsAt && v.expiresAt && v.startsAt > v.expiresAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["expiresAt"],
        message: "終了日は開始日以降にしてください",
      });
    }
  });

export type CouponInput = z.infer<typeof couponSchema>;
