/**
 * 顧客の表示順は患者番号(code)を最優先。
 * 数字のみのコード→数値昇順、英数字混在→文字列昇順、code未設定→末尾。
 * 数字コード同士は数値比較するので "2" < "10" < "650" < "1650" の順に並ぶ。
 */
export function compareByCustomerCode(
  a: { code: string | null; kana?: string | null; name?: string | null },
  b: { code: string | null; kana?: string | null; name?: string | null },
): number {
  const aCode = a.code?.trim() ?? "";
  const bCode = b.code?.trim() ?? "";
  if (!aCode && !bCode) {
    return (
      (a.kana ?? "").localeCompare(b.kana ?? "", "ja") ||
      (a.name ?? "").localeCompare(b.name ?? "", "ja")
    );
  }
  if (!aCode) return 1;
  if (!bCode) return -1;
  const aIsNum = /^\d+$/.test(aCode);
  const bIsNum = /^\d+$/.test(bCode);
  if (aIsNum && bIsNum) {
    const diff = Number(aCode) - Number(bCode);
    if (diff !== 0) return diff;
    return aCode.length - bCode.length;
  }
  if (aIsNum) return -1;
  if (bIsNum) return 1;
  return aCode.localeCompare(bCode, "ja");
}

/**
 * 顧客検索ロジック。患者番号(code)を最優先、電話番号はおまけ機能。
 * - 数字のみの入力: code の完全一致を最優先。一致が無ければ電話番号の部分一致にフォールバック。
 *   （例: "650" で検索しても "1650" や "2650"、電話に650が含まれる人は出ない）
 * - それ以外: 氏名・カナ・メール・code の部分一致。
 */
export function filterCustomersByQuery<
  C extends {
    name: string;
    kana?: string | null;
    code?: string | null;
    phone?: string | null;
    email?: string | null;
  },
>(customers: C[], rawQuery: string): C[] {
  const q = rawQuery.trim();
  if (!q) return customers;
  if (/^\d+$/.test(q)) {
    const exact = customers.filter((c) => (c.code ?? "").trim() === q);
    if (exact.length > 0) return exact;
    return customers.filter((c) =>
      (c.phone ?? "").replace(/\D/g, "").includes(q),
    );
  }
  const lower = q.toLowerCase();
  return customers.filter(
    (c) =>
      c.name.toLowerCase().includes(lower) ||
      (c.kana ?? "").toLowerCase().includes(lower) ||
      (c.email ?? "").toLowerCase().includes(lower) ||
      (c.code ?? "").toLowerCase().includes(lower),
  );
}
