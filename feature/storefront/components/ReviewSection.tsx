"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { StarRating, StarInput } from "@/feature/storefront/components/StarRating";
import { submitReview } from "@/feature/storefront/actions/reviewActions";
import type { StorefrontReview } from "@/feature/storefront/services/getStorefront";

const dateFmt = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function ReviewSection({
  slug,
  productId,
  reviews,
  ratingAvg,
  ratingCount,
}: {
  slug: string;
  productId: number;
  reviews: StorefrontReview[];
  ratingAvg: number;
  ratingCount: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [formOpen, setFormOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rating, setRating] = useState(0);
  const [form, setForm] = useState({ authorName: "", title: "", comment: "" });

  function submit() {
    setError(null);
    if (rating < 1) {
      setError("評価（星）を選択してください");
      return;
    }
    if (!form.authorName.trim()) {
      setError("お名前（ニックネーム可）を入力してください");
      return;
    }
    startTransition(async () => {
      const res = await submitReview({
        slug,
        productId,
        rating,
        authorName: form.authorName.trim(),
        title: form.title.trim() || null,
        comment: form.comment.trim() || null,
      });
      if (res.ok) {
        setDone(true);
        setFormOpen(false);
        setForm({ authorName: "", title: "", comment: "" });
        setRating(0);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  // 評価分布
  const dist = [5, 4, 3, 2, 1].map((star) => ({
    star,
    n: reviews.filter((r) => r.rating === star).length,
  }));

  return (
    <section className="mt-6">
      <h2 className="mb-3 text-base font-semibold text-ink">
        レビュー
        {ratingCount > 0 && (
          <span className="ml-2 text-sm font-normal text-muted">
            ({ratingCount}件)
          </span>
        )}
      </h2>

      <div className="rounded-2xl border border-line bg-surface p-5 shadow-panel">
        {ratingCount > 0 ? (
          <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="text-center sm:w-32">
              <div className="text-4xl font-bold tabular-nums text-ink">
                {ratingAvg.toFixed(1)}
              </div>
              <StarRating value={ratingAvg} size={18} className="mt-1" />
              <div className="mt-1 text-xs text-faint">{ratingCount}件の評価</div>
            </div>
            <div className="flex-1 space-y-1">
              {dist.map((d) => (
                <div key={d.star} className="flex items-center gap-2 text-xs">
                  <span className="w-6 text-faint">{d.star}★</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-elevated">
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{
                        width: `${ratingCount ? (d.n / ratingCount) * 100 : 0}%`,
                      }}
                    />
                  </div>
                  <span className="w-6 text-right tabular-nums text-faint">
                    {d.n}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="mb-4 text-sm text-muted">
            まだレビューがありません。最初のレビューを投稿しませんか？
          </p>
        )}

        {done && (
          <p className="mb-4 rounded-xl border border-ok/30 bg-ok/10 px-3 py-2 text-sm text-ok">
            レビューを投稿しました。ありがとうございます！
          </p>
        )}

        {!formOpen ? (
          <Button variant="outline" size="sm" onClick={() => setFormOpen(true)}>
            ★ レビューを書く
          </Button>
        ) : (
          <div className="animate-slide-up space-y-3 rounded-xl border border-line bg-base/50 p-4">
            <div>
              <Label>評価</Label>
              <StarInput value={rating} onChange={setRating} />
            </div>
            <div>
              <Label>お名前（ニックネーム可）</Label>
              <Input
                value={form.authorName}
                onChange={(e) =>
                  setForm((f) => ({ ...f, authorName: e.target.value }))
                }
                maxLength={40}
                placeholder="さくら"
              />
            </div>
            <div>
              <Label>タイトル</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                maxLength={80}
                placeholder="使い心地がよかったです"
              />
            </div>
            <div>
              <Label>コメント</Label>
              <Textarea
                value={form.comment}
                onChange={(e) =>
                  setForm((f) => ({ ...f, comment: e.target.value }))
                }
                maxLength={1000}
                placeholder="商品の感想をお聞かせください"
              />
            </div>
            {error && (
              <p className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFormOpen(false)}
                disabled={pending}
              >
                キャンセル
              </Button>
              <Button size="sm" onClick={submit} disabled={pending}>
                {pending ? "投稿中…" : "投稿する"}
              </Button>
            </div>
          </div>
        )}

        {reviews.length > 0 && (
          <ul className="mt-5 divide-y divide-line/70">
            {reviews.map((r) => (
              <li key={r.id} className="py-4">
                <div className="flex items-center justify-between">
                  <StarRating value={r.rating} size={14} />
                  <span className="text-xs text-faint">
                    {dateFmt.format(r.createdAt)}
                  </span>
                </div>
                {r.title && (
                  <div className="mt-1.5 text-sm font-medium text-ink">
                    {r.title}
                  </div>
                )}
                {r.comment && (
                  <p className="mt-1 whitespace-pre-wrap text-sm text-muted">
                    {r.comment}
                  </p>
                )}
                <div className="mt-1.5 text-xs text-faint">{r.authorName}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
