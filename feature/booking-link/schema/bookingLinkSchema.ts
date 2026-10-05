import { z } from "zod";
import {
  MAX_SCHEDULE_DATES,
  MAX_SCHEDULE_SLOTS,
  isHhmm,
  isLocalDateTime,
  isYmd,
} from "@/feature/booking-link/lib/schedule";

const slugRe = /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/;

const ymd = z.string().refine(isYmd, "日付の形式が正しくありません");
const hhmm = z.string().refine(isHhmm, "時刻は HH:mm で入力してください");
const localDateTime = z
  .string()
  .refine(isLocalDateTime, "日時の形式が正しくありません");

/**
 * 受付する日時の制限（形式と意味は feature/booking-link/lib/schedule.ts）。
 * 管理画面のフォームとサーバー（保存時）の両方でこれを通す。
 */
export const linkScheduleSchema = z
  .object(
    {
      mode: z.enum(["always", "range", "dates", "slots"]),
      from: ymd.nullable().default(null),
      to: ymd.nullable().default(null),
      dates: z
        .array(ymd)
        .max(MAX_SCHEDULE_DATES, `日付は${MAX_SCHEDULE_DATES}日まで選べます`)
        .default([]),
      dows: z.array(z.number().int().min(0).max(6)).max(7).default([]),
      timeFrom: hhmm.nullable().default(null),
      timeTo: hhmm.nullable().default(null),
      slots: z
        .array(z.object({ date: ymd, time: hhmm }))
        .max(MAX_SCHEDULE_SLOTS, `枠は${MAX_SCHEDULE_SLOTS}件まで登録できます`)
        .default([]),
      slotCapacity: z
        .number({ invalid_type_error: "1枠あたりの受付数は数字で入力してください" })
        .int("1枠あたりの受付数は整数で入力してください")
        .min(1, "1枠あたりの受付数は1以上で入力してください")
        .max(999, "1枠あたりの受付数は999以下で入力してください")
        .nullable()
        .default(null),
      maxBookings: z
        .number({ invalid_type_error: "受付数の上限は数字で入力してください" })
        .int("受付数の上限は整数で入力してください")
        .min(1, "受付数の上限は1以上で入力してください")
        .max(9999, "受付数の上限は9999以下で入力してください")
        .nullable()
        .default(null),
      leadMinutes: z
        .number()
        .int()
        .min(0)
        .max(60 * 24 * 60, "受付締切は60日前までで指定してください")
        .default(0),
      openAt: localDateTime.nullable().default(null),
      closeAt: localDateTime.nullable().default(null),
    },
    { invalid_type_error: "受付する日時の設定を読み取れませんでした" },
  )
  .superRefine((s, ctx) => {
    const fail = (message: string, path: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, message, path: [path] });
    if (s.mode === "range") {
      if (!s.from && !s.to) {
        fail("期間の開始日か終了日を入力してください", "from");
      } else if (s.from && s.to && s.from > s.to) {
        fail("期間の終了日は開始日以降にしてください", "to");
      }
    }
    if (s.mode === "dates" && s.dates.length === 0) {
      fail("予約を受け付ける日を1日以上選んでください", "dates");
    }
    if (s.mode === "slots" && s.slots.length === 0) {
      fail("受け付ける枠を1つ以上追加してください", "slots");
    }
    if (s.mode !== "slots" && s.timeFrom && s.timeTo && s.timeFrom > s.timeTo) {
      fail("時間帯の終わりは始まり以降にしてください", "timeTo");
    }
    if (s.openAt && s.closeAt && s.openAt >= s.closeAt) {
      fail("受付期間の終了は開始より後にしてください", "closeAt");
    }
  });

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
  allowOverflowAtBreak: z.coerce.boolean().default(true),
  allowOverflowAtClose: z.coerce.boolean().default(true),
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
  // 未指定 = 変更しない（古い画面から保存されても既存の制限を消さないため）
  schedule: linkScheduleSchema.optional(),
});

export type BookingLinkInput = z.infer<typeof bookingLinkSchema>;
