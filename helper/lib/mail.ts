import "server-only";

/**
 * Resend (https://resend.com) 経由でメールを送る最小ラッパー。
 * - 環境変数 RESEND_API_KEY / MAIL_FROM が未設定なら no-op（dev/preview で安全）。
 * - 例外は飲み込み、{ ok:false, error } を返す。呼び出し側で送信失敗が
 *   予約作成自体を巻き込まないようにする。
 */
export async function sendMail(params: {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
}): Promise<{ ok: true; id?: string } | { ok: false; error: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;

  if (!apiKey || !from) {
    console.warn(
      "[mail] RESEND_API_KEY / MAIL_FROM not set — メール送信をスキップします",
    );
    return { ok: false, error: "メール送信は未設定です" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: params.to,
        subject: params.subject,
        text: params.text,
        ...(params.html ? { html: params.html } : {}),
        ...(params.replyTo ? { reply_to: params.replyTo } : {}),
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[mail] send failed", res.status, body);
      return { ok: false, error: `HTTP ${res.status}` };
    }
    const json = (await res.json().catch(() => ({}))) as { id?: string };
    return { ok: true, id: json.id };
  } catch (e) {
    console.error("[mail] send error", e);
    return { ok: false, error: "送信エラー" };
  }
}
