import { z } from "zod";

export const customerSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  name: z
    .string()
    .trim()
    .min(1, "氏名を入力してください")
    .max(80, "氏名は80文字以内で入力してください"),
  kana: z.string().trim().max(80).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  email: z
    .string()
    .trim()
    .max(120)
    .email("メールアドレスの形式が正しくありません")
    .optional()
    .nullable(),
  note: z.string().trim().max(1000).optional().nullable(),
});

export type CustomerInput = z.infer<typeof customerSchema>;
