/**
 * 最小限の CSV パーサ。クォート（""エスケープ）・カンマ・CRLF/LF・末尾改行に対応。
 * 戻り値は行ごとのセル配列。
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  // 先頭 BOM 除去
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      // CRLF の \n をスキップ
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  // 最終フィールド/行（末尾改行が無い場合）
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // 完全な空行（カンマも無い）は除外
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));
}

/**
 * ArrayBuffer を文字列にデコードする。まず UTF-8（厳密）で試し、
 * 不正バイトがあれば Shift-JIS(CP932) とみなす。日本語 CSV の多くは Shift-JIS。
 */
export function decodeTextAuto(buf: ArrayBuffer): {
  text: string;
  encoding: "utf-8" | "shift_jis";
} {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(buf);
    return { text, encoding: "utf-8" };
  } catch {
    return {
      text: new TextDecoder("shift_jis").decode(buf),
      encoding: "shift_jis",
    };
  }
}

export type CustomerImportField =
  | "code"
  | "name"
  | "kana"
  | "phone"
  | "email"
  | "postalCode"
  | "address1"
  | "address2"
  | "gender"
  | "birthday";

/** ヘッダ表記 → 取込フィールド の対応（別表記も許容）。 */
const HEADER_ALIASES: Record<CustomerImportField, string[]> = {
  code: ["患者番号", "顧客番号", "会員番号", "番号", "コード", "id", "no"],
  name: ["患者名", "顧客名", "氏名", "名前", "お名前"],
  kana: [
    "患者名カナ",
    "顧客名カナ",
    "氏名カナ",
    "名前カナ",
    "フリガナ",
    "ふりがな",
    "カナ",
  ],
  phone: ["電話番号", "電話", "tel", "携帯", "携帯電話", "連絡先"],
  email: ["メール", "メールアドレス", "email", "mail", "eメール"],
  postalCode: ["郵便番号", "〒", "郵便"],
  address1: ["住所1", "住所１", "住所"],
  address2: ["住所2", "住所２", "建物", "建物名", "番地以降"],
  gender: ["性別", "性"],
  birthday: ["生年月日", "誕生日", "生年月"],
};

const norm = (s: string) =>
  s.trim().toLowerCase().replace(/\s+/g, "").replace(/["']/g, "");

/**
 * ヘッダ行から「列インデックス → フィールド」のマッピングを構築。
 * 戻り値: { map: index→field, mapped: field→headerLabel, ignored: header[] }
 */
export function mapCsvHeaders(header: string[]): {
  map: Record<number, CustomerImportField>;
  mapped: Partial<Record<CustomerImportField, string>>;
  ignored: string[];
} {
  const map: Record<number, CustomerImportField> = {};
  const mapped: Partial<Record<CustomerImportField, string>> = {};
  const ignored: string[] = [];

  header.forEach((raw, idx) => {
    const h = norm(raw);
    let matched: CustomerImportField | null = null;
    for (const [field, aliases] of Object.entries(HEADER_ALIASES) as [
      CustomerImportField,
      string[],
    ][]) {
      if (mapped[field]) continue; // 同フィールドは最初の列を優先
      if (aliases.some((a) => norm(a) === h)) {
        matched = field;
        break;
      }
    }
    if (matched) {
      map[idx] = matched;
      mapped[matched] = raw.trim();
    } else if (raw.trim()) {
      ignored.push(raw.trim());
    }
  });

  return { map, mapped, ignored };
}

export type ParsedCustomer = {
  code: string | null;
  name: string;
  kana: string | null;
  phone: string | null;
  email: string | null;
  postalCode: string | null;
  address: string | null;
  gender: string | null;
  birthday: string | null; // "YYYY-MM-DD" or null
};

/** "1936/04/24" / "1936-4-24" / "1936年4月24日" → "YYYY-MM-DD"（不正は null）。 */
export function normalizeBirthday(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const m = s.match(/^(\d{4})\s*[/年.\-]\s*(\d{1,2})\s*[/月.\-]\s*(\d{1,2})/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${y}-${pad(mo)}-${pad(d)}`;
}

const clean = (v: string | undefined) => {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
};

/**
 * データ行をマッピングに従って ParsedCustomer に変換。
 * name 必須。住所は 住所1 + 住所2 を結合。
 */
export function rowToCustomer(
  row: string[],
  map: Record<number, CustomerImportField>,
): ParsedCustomer | null {
  const get = (field: CustomerImportField): string | undefined => {
    for (const [idx, f] of Object.entries(map)) {
      if (f === field) return row[Number(idx)];
    }
    return undefined;
  };

  const name = clean(get("name"));
  if (!name) return null;

  const addr1 = clean(get("address1"));
  const addr2 = clean(get("address2"));
  const address = [addr1, addr2].filter(Boolean).join(" ") || null;

  return {
    code: clean(get("code")),
    name,
    kana: clean(get("kana")),
    phone: clean(get("phone")),
    email: clean(get("email")),
    postalCode: clean(get("postalCode")),
    address,
    gender: clean(get("gender")),
    birthday: normalizeBirthday(get("birthday") ?? ""),
  };
}
