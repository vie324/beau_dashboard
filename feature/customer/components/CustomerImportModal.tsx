"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Label, Select } from "@/components/ui/Input";
import {
  parseCsv,
  decodeTextAuto,
  mapCsvHeaders,
  rowToCustomer,
  type ParsedCustomer,
  type CustomerImportField,
} from "@/helper/utils/csv";
import {
  importCustomersChunk,
  type ImportRow,
} from "@/feature/customer/actions/importCustomers";

const CHUNK = 500;

const FIELD_LABEL: Record<CustomerImportField, string> = {
  code: "患者番号",
  name: "氏名",
  kana: "フリガナ",
  phone: "電話番号",
  email: "メール",
  postalCode: "郵便番号",
  address1: "住所1",
  address2: "住所2",
  gender: "性別",
  birthday: "生年月日",
};

type Parsed = {
  rows: ParsedCustomer[];
  skippedNoName: number;
  totalData: number;
  encoding: string;
  mapped: Partial<Record<CustomerImportField, string>>;
  ignored: string[];
};

export function CustomerImportModal({
  open,
  onClose,
  shops,
  defaultShopId,
}: {
  open: boolean;
  onClose: () => void;
  shops: { id: number; name: string }[];
  defaultShopId: number;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [shopId, setShopId] = useState<number>(defaultShopId);
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{
    created: number;
    updated: number;
    skipped: number;
  } | null>(null);

  const shopName = shops.find((s) => s.id === shopId)?.name ?? "";

  function reset() {
    setParsed(null);
    setError(null);
    setResult(null);
    setProgress(0);
    setFileName("");
    if (fileRef.current) fileRef.current.value = "";
  }

  async function onFile(file: File) {
    setError(null);
    setResult(null);
    setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const { text, encoding } = decodeTextAuto(buf);
      const grid = parseCsv(text);
      if (grid.length < 2) {
        setError("データ行が見つかりません。CSVの中身を確認してください。");
        setParsed(null);
        return;
      }
      const [header, ...dataRows] = grid;
      const { map, mapped, ignored } = mapCsvHeaders(header);
      if (!Object.values(map).includes("name")) {
        setError(
          "氏名の列を特定できませんでした。ヘッダ行に「氏名」「患者名」などの列名が必要です。",
        );
        setParsed(null);
        return;
      }
      const rows: ParsedCustomer[] = [];
      let skippedNoName = 0;
      for (const r of dataRows) {
        const c = rowToCustomer(r, map);
        if (c) rows.push(c);
        else skippedNoName++;
      }
      setParsed({
        rows,
        skippedNoName,
        totalData: dataRows.length,
        encoding,
        mapped,
        ignored,
      });
    } catch {
      setError("ファイルの読み込みに失敗しました。");
      setParsed(null);
    }
  }

  async function runImport() {
    if (!parsed) return;
    setBusy(true);
    setError(null);
    setProgress(0);
    const acc = { created: 0, updated: 0, skipped: 0 };
    const rows: ImportRow[] = parsed.rows;
    try {
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK);
        const res = await importCustomersChunk(shopId, chunk);
        if (!res.ok) {
          setError(res.error);
          setBusy(false);
          return;
        }
        acc.created += res.created;
        acc.updated += res.updated;
        acc.skipped += res.skipped;
        setProgress(Math.min(100, Math.round(((i + chunk.length) / rows.length) * 100)));
      }
      setResult(acc);
      router.refresh();
    } catch {
      setError("取り込み中に通信エラーが発生しました。");
    } finally {
      setBusy(false);
    }
  }

  function handleClose() {
    if (busy) return;
    reset();
    onClose();
  }

  return (
    <Modal open={open} onClose={handleClose} title="顧客CSV取込">
      <div className="space-y-4">
        {/* 完了サマリ */}
        {result ? (
          <div className="space-y-3">
            <div className="rounded-xl border border-ok/30 bg-ok/10 px-4 py-3 text-sm text-ink">
              <p className="font-medium text-ok">取り込みが完了しました</p>
              <p className="mt-1 text-muted">
                店舗「{shopName}」｜新規 {result.created}件・更新{" "}
                {result.updated}件・スキップ {result.skipped}件
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={reset}>
                続けて取り込む
              </Button>
              <Button size="sm" onClick={handleClose}>
                閉じる
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div>
              <Label>取込先の店舗</Label>
              <Select
                value={String(shopId)}
                onChange={(e) => setShopId(Number(e.target.value))}
                disabled={busy}
              >
                {shops.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
              <p className="mt-1 text-[11px] text-faint">
                このCSVのデータは選択した店舗に紐づきます。店舗を間違えないようご注意ください。
              </p>
            </div>

            <div>
              <Label>CSVファイル（Shift-JIS / UTF-8）</Label>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onFile(f);
                }}
                className="block w-full cursor-pointer rounded-xl border border-line bg-base text-sm text-muted file:mr-3 file:cursor-pointer file:border-0 file:bg-elevated file:px-4 file:py-2 file:text-sm file:text-ink hover:file:bg-elevated/70"
              />
            </div>

            {/* プレビュー */}
            {parsed && (
              <div className="space-y-3 rounded-xl border border-line bg-base/40 p-3 text-xs">
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted">
                  <span>
                    ファイル: <span className="text-ink">{fileName}</span>
                  </span>
                  <span>
                    文字コード:{" "}
                    <span className="text-ink">
                      {parsed.encoding === "shift_jis" ? "Shift-JIS" : "UTF-8"}
                    </span>
                  </span>
                  <span>
                    取込対象:{" "}
                    <span className="font-medium text-ink">
                      {parsed.rows.length}件
                    </span>
                    {parsed.skippedNoName > 0 && (
                      <span className="text-faint">
                        （氏名なし {parsed.skippedNoName}件は除外）
                      </span>
                    )}
                  </span>
                </div>

                <div>
                  <p className="mb-1 text-faint">列の対応:</p>
                  <div className="flex flex-wrap gap-1">
                    {(
                      Object.entries(parsed.mapped) as [
                        CustomerImportField,
                        string,
                      ][]
                    ).map(([field, header]) => (
                      <span
                        key={field}
                        className="rounded-md border border-line bg-surface px-2 py-0.5"
                      >
                        {header} → {FIELD_LABEL[field]}
                      </span>
                    ))}
                  </div>
                  {parsed.ignored.length > 0 && (
                    <p className="mt-1 text-faint">
                      未使用の列: {parsed.ignored.join("、")}
                    </p>
                  )}
                </div>

                {parsed.rows.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left">
                      <thead className="text-faint">
                        <tr>
                          <th className="py-1 pr-3">氏名</th>
                          <th className="py-1 pr-3">カナ</th>
                          <th className="py-1 pr-3">電話</th>
                          <th className="py-1 pr-3">生年月日</th>
                          <th className="py-1 pr-3">番号</th>
                        </tr>
                      </thead>
                      <tbody className="text-ink">
                        {parsed.rows.slice(0, 5).map((c, i) => (
                          <tr key={i} className="border-t border-line/50">
                            <td className="py-1 pr-3">{c.name}</td>
                            <td className="py-1 pr-3 text-muted">{c.kana}</td>
                            <td className="py-1 pr-3 text-muted">{c.phone}</td>
                            <td className="py-1 pr-3 text-muted">
                              {c.birthday}
                            </td>
                            <td className="py-1 pr-3 text-muted">{c.code}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {parsed.rows.length > 5 && (
                      <p className="mt-1 text-faint">
                        ほか {parsed.rows.length - 5}件…
                      </p>
                    )}
                  </div>
                )}
                <p className="text-faint">
                  ※「患者番号」が一致する顧客は上書き更新されます（重複作成されません）。
                </p>
              </div>
            )}

            {busy && (
              <div className="space-y-1">
                <div className="h-2 w-full overflow-hidden rounded-full bg-elevated">
                  <div
                    className="h-full bg-accent transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-center text-xs text-muted">
                  取り込み中… {progress}%
                </p>
              </div>
            )}

            {error && (
              <p className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
                {error}
              </p>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClose}
                disabled={busy}
              >
                キャンセル
              </Button>
              <Button
                size="sm"
                onClick={runImport}
                disabled={busy || !parsed || parsed.rows.length === 0}
              >
                {busy
                  ? "取り込み中…"
                  : parsed
                    ? `「${shopName}」に${parsed.rows.length}件取り込む`
                    : "取り込む"}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
