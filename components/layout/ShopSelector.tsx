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
      <span className="max-w-[5.5rem] truncate rounded-xl border border-line bg-surface px-3 py-1.5 text-xs text-muted sm:max-w-none">
        {shops[0].name}
      </span>
    );
  }

  return (
    <select
      aria-label="店舗を切り替え"
      value={activeShopId}
      disabled={pending}
      onChange={(e) => {
        const id = Number(e.target.value);
        startTransition(async () => {
          await setActiveShopId(id);
          router.refresh();
        });
      }}
      className="h-9 max-w-[5.5rem] appearance-none truncate rounded-xl border border-line bg-surface px-3 pr-7 text-xs text-ink transition-colors hover:border-accent/50 focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:opacity-50 sm:max-w-none"
    >
      {shops.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
  );
}
