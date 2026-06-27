import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/helper/lib/stripe";
import {
  finalizeOrderPaid,
  releaseOrderStock,
  refundOrderByPaymentIntent,
} from "@/feature/order/lib/finalizeOrder";

function orderIdFromSession(session: Stripe.Checkout.Session): number | null {
  const id = Number(session.metadata?.orderId);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function paymentIdFromSession(session: Stripe.Checkout.Session): string | null {
  return typeof session.payment_intent === "string"
    ? session.payment_intent
    : (session.payment_intent?.id ?? null);
}

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
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;
        const orderId = orderIdFromSession(session);
        // completed は非同期決済（コンビニ/銀行振込）だと未入金で届くことがある。
        // 入金済み（payment_status === "paid"）のときだけ確定する。
        if (orderId && session.payment_status === "paid") {
          await finalizeOrderPaid(
            orderId,
            paymentIdFromSession(session),
            session.id,
          );
        }
        break;
      }
      case "checkout.session.expired":
      case "checkout.session.async_payment_failed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const orderId = orderIdFromSession(session);
        // 未決済のまま失効/失敗 → 予約在庫を解放
        if (orderId) await releaseOrderStock(orderId, "cancelled");
        break;
      }
      case "charge.refunded": {
        // Stripe ダッシュボード等での返金を社内データに反映（在庫戻し・ポイント取消）
        const charge = event.data.object as Stripe.Charge;
        const pi =
          typeof charge.payment_intent === "string"
            ? charge.payment_intent
            : (charge.payment_intent?.id ?? null);
        if (pi) await refundOrderByPaymentIntent(pi);
        break;
      }
      default:
        break;
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
