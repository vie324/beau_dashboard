"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { StarRating } from "@/feature/storefront/components/StarRating";
import {
  fetchProductReviews,
  setReviewPublished,
  deleteReview,
} from "@/feature/product/actions/productActions";
import type { AdminReviewRow } from "@/feature/product/services/getProducts";

const dateFmt = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  month: "2-digit",
  day: "2-digit",
});

export function ReviewsModal({
  open,
  onClose,
  productId,
  productName,
}: {
  open: boolean;
  onClose: () => void;
  productId: number;
  productName: string;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<AdminReviewRow[] | null>(null);
  const [pending, startTransition] = useTransition();

  async function reload() {
    const data = await fetchProductReviews(productId);
    setRows(data);
  }

  useEffect(() => {
    if (open) reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, productId]);

  function togglePublish(r: AdminReviewRow) {
    startTransition(async () => {
      const res = await setReviewPublished(r.id, !r.isPublished);
      if (!res.ok) alert(res.error);
      else {
        await reload();
        router.refresh();
      }
    });
  }

  function remove(r: AdminReviewRow) {
    if (!confirm("このレビューを削除しますか？")) return;
    startTransition(async () => {
      const res = await deleteReview(r.id);
      if (!res.ok) alert(res.error);
      else {
        await reload();
        router.refresh();
      }
    });
  }

  return (
    <Modal open={open} onClose={onClose} title={`レビュー管理：${productName}`}>
      {rows === null ? (
        <p className="py-8 text-center text-sm text-faint">読み込み中…</p>
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-faint">
          レビューはまだありません。
        </p>
      ) : (
        <ul className="divide-y divide-line/70">
          {rows.map((r) => (
            <li key={r.id} className="py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <StarRating value={r.rating} size={14} />
                  {!r.isPublished && (
                    <Badge className="border-line bg-elevated text-muted">
                      非表示
                    </Badge>
                  )}
                </div>
                <span className="text-xs text-faint">
                  {dateFmt.format(r.createdAt)}
                </span>
              </div>
              {r.title && (
                <div className="mt-1 text-sm font-medium text-ink">{r.title}</div>
              )}
              {r.comment && (
                <p className="mt-0.5 whitespace-pre-wrap text-sm text-muted">
                  {r.comment}
                </p>
              )}
              <div className="mt-1 flex items-center justify-between">
                <span className="text-xs text-faint">{r.authorName}</span>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => togglePublish(r)}
                    disabled={pending}
                  >
                    {r.isPublished ? "非表示にする" : "公開する"}
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => remove(r)}
                    disabled={pending}
                  >
                    削除
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 flex justify-end">
        <Button variant="ghost" size="sm" onClick={onClose}>
          閉じる
        </Button>
      </div>
    </Modal>
  );
}
