"use client";

import { useTransition } from "react";
import { logoutAction } from "@/feature/auth/actions/authActions";

export function UserMenu({ name }: { name: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-3">
      <span className="hidden text-xs text-muted sm:inline">{name}</span>
      <button
        onClick={() => startTransition(() => logoutAction())}
        disabled={pending}
        className="rounded-xl border border-line px-3 py-1.5 text-xs text-muted transition-colors hover:border-danger/40 hover:text-danger disabled:opacity-50"
      >
        ログアウト
      </button>
    </div>
  );
}
