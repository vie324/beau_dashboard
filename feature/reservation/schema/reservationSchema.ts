import { z } from "zod";

const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;
const dateRe = /^\d{4}-\d{2}-\d{2}$/;

export const appointmentSchema = z
  .object({
    id: z.coerce.number().int().positive().optional(),
    date: z.string().regex(dateRe, "日付を選択してください"),
    startTime: z.string().regex(timeRe, "開始時刻を入力してください"),
    durationMin: z.coerce
      .number()
      .int()
      .min(5, "施術時間は5分以上で入力してください")
      .max(600),
    menuId: z.coerce.number().int().positive().optional().nullable(),
    staffId: z.coerce.number().int().positive().optional().nullable(),
    customerId: z.coerce.number().int().positive().optional().nullable(),
    visitSourceId: z.coerce.number().int().positive().optional().nullable(),
    guestName: z.string().trim().max(80).optional().nullable(),
    guestPhone: z.string().trim().max(40).optional().nullable(),
    status: z.coerce.number().int().default(0),
    sales: z.coerce.number().int().min(0).optional().nullable(),
    note: z.string().trim().max(1000).optional().nullable(),
    // "1" = スタッフ/設備の重複チェックを無視してダブルブッキングを許可（手動登録のみ）。
    allowOverlap: z.literal("1").optional(),
  })
  .refine((v) => v.customerId != null || (v.guestName ?? "").length > 0, {
    message: "顧客を選択するか、来店者名を入力してください",
    path: ["guestName"],
  });

export type AppointmentInput = z.infer<typeof appointmentSchema>;

// 予約以外の時間ブロック（休憩・会議・私用 / 設備使用不可 等）
export const timeBlockSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  date: z.string().regex(dateRe, "日付を選択してください"),
  startTime: z.string().regex(timeRe, "開始時刻を入力してください"),
  durationMin: z.coerce
    .number()
    .int()
    .min(5, "時間は5分以上で入力してください")
    .max(600),
  // 未指定（空欄）= 全スタッフを同時にブロック。equipmentId が指定されていれば設備ブロック。
  staffId: z.coerce.number().int().positive().optional().nullable(),
  equipmentId: z.coerce.number().int().positive().optional().nullable(),
  label: z.string().trim().max(40).optional().nullable(),
});

export type TimeBlockInput = z.infer<typeof timeBlockSchema>;

// Public booking page — fewer fields, customer always a guest.
export const publicBookingSchema = z.object({
  slug: z.string().min(1),
  shopId: z.coerce.number().int().positive(),
  menuId: z.coerce.number().int().positive(),
  staffId: z.coerce.number().int().positive().optional().nullable(),
  date: z.string().regex(dateRe),
  startTime: z.string().regex(timeRe),
  guestName: z.string().trim().min(1, "お名前を入力してください").max(80),
  guestPhone: z
    .string()
    .trim()
    .min(8, "電話番号を入力してください")
    .max(40),
  note: z.string().trim().max(1000).optional().nullable(),
});

export type PublicBookingInput = z.infer<typeof publicBookingSchema>;
