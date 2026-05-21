import { z } from "zod";

const slugRe = /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/;

export const bookingLinkSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      slugRe,
      "slug は英小文字・数字・ハイフン（2〜50文字）で入力してください",
    ),
  name: z.string().trim().min(1, "リンク名を入力してください").max(80),
  description: z.string().trim().max(500).optional().nullable(),
  // null = brand-common (店舗未指定)
  shopId: z.coerce.number().int().positive().optional().nullable(),
  isActive: z.coerce.boolean().default(true),
  requireStaffSelection: z.coerce.boolean().default(false),
  lastReceptionMode: z.coerce.boolean().default(false),
  allowedMenuIds: z.array(z.coerce.number().int().positive()).default([]),
  intervalMin: z.coerce
    .number()
    .int()
    .refine((v) => v === 15 || v === 30 || v === 60, {
      message: "時間間隔は 15 / 30 / 60 分のいずれかを選んでください",
    })
    .default(30),
  reminderEnabled: z.coerce.boolean().default(false),
  reminderHoursBefore: z.coerce.number().int().min(1).max(168).default(24),
});

export type BookingLinkInput = z.infer<typeof bookingLinkSchema>;
