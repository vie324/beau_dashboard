import { z } from "zod";

const id = z.coerce.number().int().positive().optional();

// Form fields arrive as strings; treat only "true"/"on"/"1" as true.
const bool = z.preprocess(
  (v) => v === true || v === "true" || v === "on" || v === "1" || v === 1,
  z.boolean(),
);

export const shopSchema = z.object({
  id,
  name: z.string().trim().min(1, "店舗名を入力してください").max(80),
  sortNumber: z.coerce.number().int().min(0).max(9999).default(0),
  address: z.string().trim().max(200).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  lineUrl: z.string().trim().max(300).optional().nullable(),
});
export type ShopInput = z.infer<typeof shopSchema>;

export const staffSchema = z.object({
  id,
  name: z.string().trim().min(1, "スタッフ名を入力してください").max(80),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "色は #RRGGBB 形式で入力してください")
    .default("#6f9bd8"),
  allocateOrder: z.coerce.number().int().min(0).max(9999).default(0),
  isBookable: bool.default(true),
});
export type StaffInput = z.infer<typeof staffSchema>;

export const menuSchema = z.object({
  id,
  name: z.string().trim().min(1, "メニュー名を入力してください").max(120),
  durationMin: z.coerce
    .number()
    .int()
    .min(5, "施術時間は5分以上で入力してください")
    .max(600)
    .default(60),
  price: z.coerce.number().int().min(0).max(10_000_000).default(0),
  isPublic: bool.default(true),
  sortNumber: z.coerce.number().int().min(0).max(9999).default(0),
  // true = 全店舗共通 (shopId null), false = この店舗のみ
  brandCommon: bool.default(true),
});
export type MenuInput = z.infer<typeof menuSchema>;
