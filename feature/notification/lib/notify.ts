import "server-only";
import { db } from "@/helper/lib/db";
import {
  formatJpDate,
  toLocalDateString,
  toLocalTimeString,
} from "@/helper/utils/time";
import {
  isMailConfigured,
  parseRecipients,
  sendMail,
} from "@/helper/lib/mailer";

/**
 * 予約が入った / キャンセルされたタイミングの通知。
 *
 *  1. Notification 行を作る（画面右上のベルに出る。メール設定が無くても必ず動く）
 *  2. 店舗に通知先メールが設定されていればメールも送る
 *
 * 通知は「おまけ」なので、ここで何が起きても予約処理自体は成功させる。
 * そのため全体を try/catch で包み、例外は投げずに握りつぶす。
 */

export type NotifyKind = "reservation" | "cancel";

const TITLE: Record<NotifyKind, { public: string; manual: string }> = {
  reservation: {
    public: "ネット予約が入りました",
    manual: "予約が登録されました",
  },
  cancel: {
    public: "予約がキャンセルされました",
    manual: "予約がキャンセルされました",
  },
};

const APPOINTMENT_SELECT = {
  id: true,
  shopId: true,
  startAt: true,
  endAt: true,
  note: true,
  source: true,
  kind: true,
  guestName: true,
  guestPhone: true,
  staff: { select: { name: true } },
  menu: { select: { name: true } },
  equipment: { select: { name: true } },
  customer: { select: { name: true, code: true, phone: true } },
  shop: { select: { name: true, notifyEmail: true, notifyManualBooking: true } },
} as const;

type ApptForNotify = NonNullable<
  Awaited<ReturnType<typeof loadAppointment>>
>;

function loadAppointment(id: number) {
  return db.appointment.findFirst({
    where: { id },
    select: APPOINTMENT_SELECT,
  });
}

function customerLabel(a: ApptForNotify): string {
  const name = a.customer?.name ?? a.guestName;
  if (!name) return "お客様";
  return a.customer?.code ? `${name} 様（No.${a.customer.code}）` : `${name} 様`;
}

/** "9月17日(水) 14:00〜15:00" */
export function formatSlot(startAt: Date, endAt: Date): string {
  return `${formatJpDate(toLocalDateString(startAt))} ${toLocalTimeString(
    startAt,
  )}〜${toLocalTimeString(endAt)}`;
}

/** 通知本文。1行に詰めてベルの一覧でもそのまま読めるようにする。 */
function buildBody(a: ApptForNotify, detail?: string): string {
  const parts = [
    formatSlot(a.startAt, a.endAt),
    customerLabel(a),
    a.menu?.name ?? "メニュー未設定",
  ];
  if (a.staff?.name) parts.push(`担当 ${a.staff.name}`);
  else if (a.equipment?.name) parts.push(a.equipment.name);
  const phone = a.customer?.phone ?? a.guestPhone;
  if (phone) parts.push(phone);
  if (detail) parts.push(detail);
  return parts.join(" / ");
}

function buildMailText(a: ApptForNotify, title: string): string {
  const lines = [
    `【${a.shop.name}】${title}`,
    "",
    `日時　：${formatSlot(a.startAt, a.endAt)}`,
    `お客様：${customerLabel(a)}`,
    `メニュー：${a.menu?.name ?? "未設定"}`,
  ];
  if (a.staff?.name) lines.push(`担当　：${a.staff.name}`);
  if (a.equipment?.name) lines.push(`設備　：${a.equipment.name}`);
  const phone = a.customer?.phone ?? a.guestPhone;
  if (phone) lines.push(`電話　：${phone}`);
  if (a.note) lines.push(`メモ　：${a.note}`);
  lines.push("", `受付　：${a.source === "public" ? "ネット予約" : "管理画面"}`);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (appUrl) {
    lines.push(
      "",
      `予約表：${appUrl.replace(/\/$/, "")}/reservation?date=${toLocalDateString(
        a.startAt,
      )}`,
    );
  }
  return lines.join("\n");
}

/**
 * 予約 1 件について通知を作る。`kind` が "cancel" のときはキャンセル扱い。
 * 手動登録の新規予約は店舗設定 notifyManualBooking が false なら通知しない
 * （自分で入れた予約の通知はノイズになるため）。キャンセルは常に通知する。
 */
export async function notifyAppointment(params: {
  appointmentId: number;
  kind: NotifyKind;
  /** キャンセル種別など、本文末尾に足す補足（例: "当日キャンセル"）。 */
  detail?: string;
}): Promise<void> {
  try {
    const a = await loadAppointment(params.appointmentId);
    // 時間ブロック（休憩・会議）は予約ではないので通知しない。
    if (!a || a.kind === "block") return;

    const isPublic = a.source === "public";
    if (params.kind === "reservation" && !isPublic && !a.shop.notifyManualBooking) {
      return;
    }

    const title = TITLE[params.kind][isPublic ? "public" : "manual"];
    const body = buildBody(a, params.detail);

    await db.notification.create({
      data: {
        shopId: a.shopId,
        type: params.kind,
        title,
        body,
        appointmentId: a.id,
        startAt: a.startAt,
      },
    });

    const to = parseRecipients(a.shop.notifyEmail);
    if (to.length && isMailConfigured()) {
      // 失敗しても画面通知は残っているので、ここでは結果を捨てる。
      await sendMail({
        to,
        subject: `【${a.shop.name}】${title} ${formatSlot(a.startAt, a.endAt)}`,
        text: buildMailText(a, title),
      });
    }
  } catch {
    // 通知の失敗で予約操作を巻き込まない。
  }
}
