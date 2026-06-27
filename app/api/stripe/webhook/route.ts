import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/helper/lib/stripe";
import { finalizeOrderPaid } from "@/feature/order/lib/finalizeOrder";

// Webhook は生のリクエストボディで署名検証するため、Edge/最適化を無効化。
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "STRIPE_WEBHOOK_SECRET 未設定" },
      { status: 500 },
    );
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "署名がありません" }, { status: 400 });
  }

  const body = await req.text(); // 生ボディ

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, sig, secret);
  } catch (err) {
    return NextResponse.json(
      { error: `署名検証に失敗: ${err instanceof Error ? err.message : ""}` },
      { status: 400 },
    );
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const orderId = Number(session.metadata?.orderId);
      if (Number.isInteger(orderId) && orderId > 0) {
        const paymentId =
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : (session.payment_intent?.id ?? null);
        await finalizeOrderPaid(orderId, paymentId);
      }
    }
  } catch (err) {
    // 失敗時は 500 を返して Stripe にリトライさせる（finalize は冪等）。
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "処理に失敗しました" },
      { status: 500 },
    );
  }

  return NextResponse.json({ received: true });
}
