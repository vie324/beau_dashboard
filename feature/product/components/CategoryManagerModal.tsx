"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  saveCategory,
  deleteCategory,
} from "@/feature/product/actions/productActions";
import type { CategoryRow } from "@/feature/product/services/getProducts";

export function CategoryManagerModal({
  open,
  onClose,
  categories,
}: {
  open: boolean;
  onClose: () => void;
  categories: CategoryRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [edits, setEdits] = useState<Record<number, string>>({});

  function add() {
    if (!newName.trim()) return;
    setError(null);
    const fd = new FormData();
    fd.set("name", newName.trim());
    fd.set("sortNumber", String(categories.length + 1));
    startTransition(async () => {
      const res = await saveCategory(null, fd);
      if (res.ok) {
        setNewName("");
        router.refresh();
      } else setError(res.error);
    });
  }

  function rename(c: CategoryRow) {
    const name = (edits[c.id] ?? c.name).trim();
    if (!name) return;
    setError(null);
    const fd = new FormData();
    fd.set("id", String(c.id));
    fd.set("name", name);
    fd.set("sortNumber", String(c.sortNumber));
    startTransition(async () => {
      const res = await saveCategory(null, fd);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  function remove(c: CategoryRow) {
    if (!confirm(`カテゴリ「${c.name}」を削除しますか？（商品は未分類になります）`))
      return;
    startTransition(async () => {
      const res = await deleteCategory(c.id);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  return (
    <Modal open={open} onClose={onClose} title="カテゴリ管理">
      <div className="space-y-4">
        <div className="flex items-end gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="新しいカテゴリ名"
            maxLength={60}
          />
          <Button size="sm" onClick={add} disabled={pending || !newName.trim()}>
            ＋ 追加
          </Button>
        </div>

        {categories.length === 0 ? (
          <p className="py-6 text-center text-sm text-faint">
            カテゴリがありません。
          </p>
        ) : (
          <ul className="divide-y divide-line/70">
            {categories.map((c) => (
              <li key={c.id} className="flex items-center gap-2 py-2">
                <Input
                  value={edits[c.id] ?? c.name}
                  onChange={(e) =>
                    setEdits((s) => ({ ...s, [c.id]: e.target.value }))
                  }
                  maxLength={60}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => rename(c)}
                  disabled={pending}
                >
                  保存
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => remove(c)}
                  disabled={pending}
                >
                  削除
                </Button>
              </li>
            ))}
          </ul>
        )}

        {error && (
          <p className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
            {error}
          </p>
        )}

        <div className="flex justify-end pt-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            閉じる
          </Button>
        </div>
      </div>
    </Modal>
  );
}
