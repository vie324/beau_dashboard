import "server-only";

/**
 * 最小構成のメール送信。依存パッケージを増やさないため Resend の HTTP API を
 * fetch でそのまま叩く（SMTP ライブラリ不要）。
 *
 * 環境変数:
 *   RESEND_API_KEY   … 必須。未設定ならメールは送らず画面通知だけになる。
 *   NOTIFY_MAIL_FROM … 送信元。未設定なら Resend のサンドボックス送信元を使う
 *                      （独自ドメインの verify 前でも届く）。
 *
 * 呼び出し側の処理（予約の保存など）を絶対に止めないため、この関数は例外を
 * 投げない。失敗は戻り値の reason で返す。
 */

const ENDPOINT = "https://api.resend.com/emails";
const TIMEOUT_MS = 8000;

export type MailResult = { ok: true } | { ok: false; reason: string };

/** API キーが設定されていればメール送信を試みる。 */
export function isMailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

function fromAddress(): string {
  return (
    process.env.NOTIFY_MAIL_FROM?.trim() || "Beau <onboarding@resend.dev>"
  );
}

/** "a@x.com, b@y.com" / 改行区切り → ["a@x.com", "b@y.com"]（重複除去）。 */
export function parseRecipients(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  for (const part of raw.split(/[,\s;]+/)) {
    const v = part.trim();
    // ざっくり形式チェック。厳密な検証は設定画面側の zod に任せる。
    if (v.includes("@") && v.length <= 254) seen.add(v);
  }
  return [...seen];
}

export async function sendMail(params: {
  to: string[];
  subject: string;
  text: string;
}): Promise<MailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return { ok: false, reason: "RESEND_API_KEY が未設定です" };
  if (params.to.length === 0) return { ok: false, reason: "宛先がありません" };

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress(),
        to: params.to,
        subject: params.subject,
        text: params.text,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return {
        ok: false,
        reason: `メール送信に失敗しました (${res.status}) ${detail.slice(0, 200)}`,
      };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}
