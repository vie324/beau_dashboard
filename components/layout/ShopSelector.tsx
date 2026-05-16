"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setActiveShopId } from "@/feature/shop/actions/shopActions";

export function ShopSelector({
  shops,
  activeShopId,
}: {
  shops: { id: number; name: string }[];
  activeShopId: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (shops.length === 0) return null;

  if (shops.length === 1) {
    return (
      <span className="rounded-xl border border-line bg-surface px-3 py-1.5 text-xs text-muted">
        {shops[0].name}
      </span>
    );
  }

  return (
    <select
      value={activeShopId}
      disabled={pending}
      onChange={(e) => {
        const id = Number(e.target.value);
        startTransition(async () => {
          await setActiveShopId(id);
          router.refresh();
        });
      }}
      className="h-9 appearance-none rounded-xl border border-line bg-surface px-3 pr-7 text-xs text-ink transition-colors hover:border-accent/50 focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:opacity-50"
    >
      {shops.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
  );
}
