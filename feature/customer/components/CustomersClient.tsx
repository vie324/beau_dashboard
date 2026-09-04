"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { CustomerForm } from "@/feature/customer/components/CustomerForm";
import { CustomerImportModal } from "@/feature/customer/components/CustomerImportModal";
import { CustomerDetailModal } from "@/feature/customer/components/CustomerDetailModal";
import { deleteCustomer } from "@/feature/customer/actions/customerActions";
import type { CustomerRow } from "@/feature/customer/services/getCustomers";
import { filterCustomersByQuery } from "@/helper/utils/customerSort";

const dateFmt = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function CustomersClient({
  customers,
  shops,
  activeShopId,
}: {
  customers: CustomerRow[];
  shops: { id: number; name: string }[];
  activeShopId: number;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<CustomerRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [detailFor, setDetailFor] = useState<CustomerRow | null>(null);
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(
    () => filterCustomersByQuery(customers, query),
    [customers, query],
  );

  function handleDelete(c: CustomerRow) {
    if (!confirm(`「${c.name}」を削除しますか？（過去の予約履歴は残ります）`)) {
      return;
    }
    startTransition(async () => {
      const res = await deleteCustomer(c.id);
      if (!res.ok) {
        alert(res.error);
      } else {
        router.refresh();
      }
    });
  }

  const closeModal = () => {
    setCreating(false);
    setEditing(null);
  };

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="患者番号・氏名・カナ・メールで検索（電話番号も可）"
          className="sm:max-w-sm"
        />
        <div className="flex shrink-0 items-center gap-3">
          <span className="text-xs text-faint">
            {customers.length}件中 {filtered.length}件
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setImporting(true)}
          >
            CSV取込
          </Button>
          <Button size="sm" onClick={() => setCreating(true)}>
            ＋ 新規顧客
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-panel">
        {filtered.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-faint">
            {query
              ? "該当する顧客がいません。検索条件を変えてください。"
              : "顧客が登録されていません。「＋ 新規顧客」から追加してください。"}
          </p>
        ) : (
          <ul className="divide-y divide-line/70">
            {filtered.map((c) => (
              <li
                key={c.id}
                className="flex flex-col gap-3 px-4 py-3 transition-colors hover:bg-elevated/30 sm:flex-row sm:items-center sm:justify-between"
              >
                <button
                  type="button"
                  onClick={() => setEditing(c)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="truncate font-medium text-ink">
                      {c.name}
                    </span>
                    {c.kana && (
                      <span className="truncate text-xs text-faint">
                        ({c.kana})
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
                    {c.code && (
                      <span className="tabular-nums text-faint">
                        No.{c.code}
                      </span>
                    )}
                    {c.phone && (
                      <span className="tabular-nums">TEL：{c.phone}</span>
                    )}
                    {c.birthday && (
                      <span className="tabular-nums">
                        生：{dateFmt.format(new Date(c.birthday))}
                      </span>
                    )}
                    {c.email && (
                      <span className="truncate">{c.email}</span>
                    )}
                    <span>来店：{c.visitCount}回</span>
                    {c.lastVisitAt && (
                      <span>
                        最終：{dateFmt.format(new Date(c.lastVisitAt))}
                      </span>
                    )}
                    {c.purchaseCount > 0 && (
                      <span className="text-ink">
                        物販：{c.purchaseCount}件 / ¥
                        {c.purchaseTotal.toLocaleString("ja-JP")}
                      </span>
                    )}
                    {c.pointsBalance !== 0 && (
                      <span
                        className={
                          "rounded-md border px-1.5 " +
                          (c.pointsBalance > 0
                            ? "border-accent/40 bg-accent-soft text-accent"
                            : "border-danger/40 bg-danger/10 text-danger")
                        }
                      >
                        {c.pointsBalance.toLocaleString("ja-JP")}pt
                      </span>
                    )}
                  </div>
                  {c.note && (
                    <div className="mt-1 truncate text-xs text-faint">
                      {c.note}
                    </div>
                  )}
                </button>
                <div className="flex shrink-0 gap-2 self-end sm:self-auto">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setDetailFor(c)}
                    disabled={pending}
                    title="ポイント台帳・購入履歴・手動付与"
                  >
                    ポイント
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditing(c)}
                    disabled={pending}
                  >
                    編集
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => handleDelete(c)}
                    disabled={pending}
                  >
                    {pending ? "削除中…" : "削除"}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {(creating || editing) && (
        <CustomerForm open initial={editing} onClose={closeModal} />
      )}

      {importing && (
        <CustomerImportModal
          open
          onClose={() => setImporting(false)}
          shops={shops}
          defaultShopId={activeShopId}
        />
      )}

      {detailFor && (
        <CustomerDetailModal
          open
          customerId={detailFor.id}
          customerName={detailFor.name}
          onClose={() => setDetailFor(null)}
        />
      )}
    </>
  );
}
