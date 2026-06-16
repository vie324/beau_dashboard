import "server-only";
import { db } from "@/helper/lib/db";
import { sendMail } from "@/helper/lib/mail";

/** JST で "5/21(木) 13:00" のような文字列を作る。 */
function fmtJpDateTime(d: Date): string {
  const tz = "Asia/Tokyo";
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: tz,
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("month")}/${get("day")}(${get("weekday")}) ${get("hour")}:${get("minute")}`;
}

function fmtJpTime(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

/**
 * 予約作成時にお客様（メールがあれば）と店舗の通知用メール（設定されていれば）へ
 * 確定メールを送る best-effort 通知。失敗はログに残すだけで例外は投げない。
 */
export async function sendBookingEmails(appointmentId: number): Promise<void> {
  try {
    await sendBookingEmailsInner(appointmentId);
  } catch (e) {
    console.error("[notify] unexpected error", e);
  }
}

async function sendBookingEmailsInner(appointmentId: number): Promise<void> {
  let appt;
  try {
    appt = await db.appointment.findFirst({
      where: { id: appointmentId, deletedAt: null, kind: "appointment" },
      include: {
        customer: { select: { name: true, email: true } },
        staff: { select: { name: true } },
        menu: { select: { name: true } },
        shop: {
          select: {
            name: true,
            address: true,
            phone: true,
            notificationEmail: true,
          },
        },
      },
    });
  } catch (e) {
    console.error("[notify] failed to fetch appointment", e);
    return;
  }
  if (!appt) return;

  const start = new Date(appt.startAt);
  const end = new Date(appt.endAt);
  const when = `${fmtJpDateTime(start)}〜${fmtJpTime(end)}`;
  const customerName = appt.customer?.name ?? appt.guestName ?? "お客様";
  const shopName = appt.shop?.name ?? "店舗";
  const menuName = appt.menu?.name ?? "（メニュー未設定）";
  const staffName = appt.staff?.name ?? "（担当未指定）";

  const sends: Promise<unknown>[] = [];

  // 1) お客様向け（メールがあれば）
  if (appt.customer?.email) {
    const subject = `ご予約ありがとうございます — ${shopName}`;
    const text = [
      `${customerName} 様`,
      "",
      `この度はご予約をいただきありがとうございます。下記の内容で承りました。`,
      "",
      `日時: ${when}`,
      `メニュー: ${menuName}`,
      `担当: ${staffName}`,
      "",
      `店舗: ${shopName}`,
      appt.shop?.address ? `住所: ${appt.shop.address}` : "",
      appt.shop?.phone ? `電話: ${appt.shop.phone}` : "",
      "",
      "ご来店をお待ちしております。",
      "ご変更・キャンセルの際はお手数ですが上記までご連絡ください。",
    ]
      .filter(Boolean)
      .join("\n");
    sends.push(
      sendMail({
        to: appt.customer.email,
        subject,
        text,
        replyTo: appt.shop?.notificationEmail ?? undefined,
      }),
    );
  }

  // 2) 店舗側（通知用メールが設定されていれば）
  if (appt.shop?.notificationEmail) {
    const subject = `新規予約: ${fmtJpDateTime(start)} ${customerName}`;
    const text = [
      `${shopName} に新しい予約が入りました。`,
      "",
      `日時: ${when}`,
      `お客様: ${customerName}`,
      appt.customer?.email ? `メール: ${appt.customer.email}` : "",
      appt.guestPhone ? `電話: ${appt.guestPhone}` : "",
      `メニュー: ${menuName}`,
      `担当: ${staffName}`,
      appt.note ? `メモ: ${appt.note}` : "",
      "",
      `予約ID: ${appt.id}`,
    ]
      .filter(Boolean)
      .join("\n");
    sends.push(
      sendMail({
        to: appt.shop.notificationEmail,
        subject,
        text,
      }),
    );
  }

  await Promise.allSettled(sends);
}
