import { z } from "zod";

const id = z.coerce.number().int().positive().optional();

// Form fields arrive as strings; treat only "true"/"on"/"1" as true.
const bool = z.preprocess(
  (v) => v === true || v === "true" || v === "on" || v === "1" || v === 1,
  z.boolean(),
);

const hhmm = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "時刻は HH:mm 形式で入力してください")
  .optional()
  .or(z.literal(""));

export const shopSchema = z.object({
  id,
  name: z.string().trim().min(1, "店舗名を入力してください").max(80),
  sortNumber: z.coerce.number().int().min(0).max(9999).default(0),
  address: z.string().trim().max(200).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  lineUrl: z.string().trim().max(300).optional().nullable(),
  notificationEmail: z
    .string()
    .trim()
    .max(120)
    .email("メールアドレスの形式が正しくありません")
    .optional()
    .nullable()
    .or(z.literal("")),
  openTime: hhmm,
  closeTime: hhmm,
  breakStart: hhmm,
  breakEnd: hhmm,
  // JSON string; structure validated when parsed in the action.
  hoursByDow: z.string().optional().nullable(),
  // JSON string of specific-date overrides; structure validated in the action.
  dateOverrides: z.string().optional().nullable(),
});
export type ShopInput = z.infer<typeof shopSchema>;

export const visitSourceSchema = z.object({
  id,
  name: z.string().trim().min(1, "経路名を入力してください").max(40),
  sortNumber: z.coerce.number().int().min(0).max(9999).default(0),
});
export type VisitSourceInput = z.infer<typeof visitSourceSchema>;

export const cardColorPresetSchema = z.object({
  id,
  name: z.string().trim().min(1, "名前を入力してください").max(40),
  hexColor: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "色は #RRGGBB 形式で指定してください"),
  sortNumber: z.coerce.number().int().min(0).max(9999).default(0),
});
export type CardColorPresetInput = z.infer<typeof cardColorPresetSchema>;

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
  spotMode: bool.default(false),
  // JSON string of work dates; structure validated in the action.
  workDates: z.string().optional().nullable(),
});
export type StaffInput = z.infer<typeof staffSchema>;

export const equipmentSchema = z.object({
  id,
  name: z.string().trim().min(1, "設備名を入力してください").max(80),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "色は #RRGGBB 形式で入力してください")
    .default("#a9803f"),
  sortNumber: z.coerce.number().int().min(0).max(9999).default(0),
  isBookable: bool.default(true),
});
export type EquipmentInput = z.infer<typeof equipmentSchema>;

export const menuSchema = z
  .object({
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
    // リソース要否。少なくとも一方は必要。
    requiresStaff: bool.default(true),
    equipmentId: z.coerce.number().int().positive().optional().nullable(),
  })
  .refine((m) => m.requiresStaff || m.equipmentId != null, {
    message: "スタッフ・設備のいずれか一方は必須です",
    path: ["requiresStaff"],
  });
export type MenuInput = z.infer<typeof menuSchema>;
