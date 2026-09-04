"use client";

// 公開販売ページの「会員確認」状態。localStorage に署名付きトークンと表示用の
// 最小情報（氏名・残高）を slug 単位で保持する。サーバはトークンだけを信用し、
// 氏名・残高は表示の初期値に使うのみ（最新値は getMemberSummary で取り直す）。

export type MemberSession = {
  token: string;
  name: string;
  pointsBalance: number;
  savedAt: number;
};

export const MEMBER_CHANGE_EVENT = "beau:member-change";

function key(slug: string): string {
  return `beau_member_${slug}`;
}

export function readMemberSession(slug: string): MemberSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key(slug));
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (!v || typeof v.token !== "string" || typeof v.name !== "string") return null;
    return {
      token: v.token,
      name: v.name,
      pointsBalance: Number.isFinite(v.pointsBalance) ? v.pointsBalance : 0,
      savedAt: Number.isFinite(v.savedAt) ? v.savedAt : 0,
    };
  } catch {
    return null;
  }
}

export function writeMemberSession(
  slug: string,
  session: Omit<MemberSession, "savedAt">,
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      key(slug),
      JSON.stringify({ ...session, savedAt: Date.now() }),
    );
    window.dispatchEvent(new Event(MEMBER_CHANGE_EVENT));
  } catch {
    /* ignore quota */
  }
}

export function clearMemberSession(slug: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key(slug));
    window.dispatchEvent(new Event(MEMBER_CHANGE_EVENT));
  } catch {
    /* ignore */
  }
}
