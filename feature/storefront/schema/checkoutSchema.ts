import { z } from "zod";

export const checkoutItemSchema = z.object({
  productId: z.number().int().positive(),
  qty: z.number().int().min(1).max(99),
});

export const checkoutSchema = z.object({
  slug: z.string().trim().min(1),
  items: z.array(checkoutItemSchema).min(1, "カートが空です").max(50),
  buyerName: z.string().trim().min(1, "お名前を入力してください").max(80),
  buyerPhone: z.string().trim().max(40).optional().nullable(),
  buyerEmail: z
    .string()
    .trim()
    .max(120)
    .email("メールアドレスの形式が正しくありません")
    .optional()
    .nullable(),
  buyerCode: z.string().trim().max(60).optional().nullable(),
  fulfillment: z.enum(["pickup", "shipping"]),
  shippingAddress: z.string().trim().max(300).optional().nullable(),
  note: z.string().trim().max(500).optional().nullable(),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;
