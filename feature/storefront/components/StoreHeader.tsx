"use client";

import { useEffect, useState } from "react";
import {
  cartCount,
  CART_CHANGE_EVENT,
  OPEN_CART_EVENT,
} from "@/feature/storefront/lib/cart";
import {
  readMemberSession,
  MEMBER_CHANGE_EVENT,
} from "@/feature/storefront/lib/memberSession";
import { CartIcon, UserIcon } from "@/feature/storefront/components/icons";

/**
 * 公開販売ページ共通のヘッダー（sticky）。
 * カート件数と会員状態は localStorage から読み、cart / member の変更イベントで同期する。
 * カートボタンはトップページではドロワーを開き（OPEN_CART_EVENT をリスナーが処理）、
 * それ以外のページではトップページ（?cart=open）へ遷移する。
 */
export function StoreHeader({ slug, title }: { slug: string; title: string }) {
  const [count, setCount] = useState(0);
  const [member, setMember] = useState<{
    name: string;
    pointsBalance: number;
  } | null>(null);

  useEffect(() => {
    const sync = () => {
      setCount(cartCount(slug));
      const m = readMemberSession(slug);
      setMember(m ? { name: m.name, pointsBalance: m.pointsBalance } : null);
    };
    sync();
    window.addEventListener(CART_CHANGE_EVENT, sync);
    window.addEventListener(MEMBER_CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CART_CHANGE_EVENT, sync);
      window.removeEventListener(MEMBER_CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [slug]);

  function openCart() {
    const ev = new CustomEvent(OPEN_CART_EVENT, { cancelable: true });
    const handled = !window.dispatchEvent(ev);
    if (!handled) window.location.href = `/shop/${slug}?cart=open`;
  }

  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-base/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4 sm:h-16 sm:gap-3 sm:px-6">
        <a
          href={`/shop/${slug}`}
          className="min-w-0 flex-1 truncate font-display text-md tracking-[0.14em] text-accent sm:text-xl"
        >
          {title}
        </a>
        <a
          href={`/shop/${slug}/member`}
          className={
            "flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs transition-colors " +
            (member
              ? "border-accent/40 bg-accent-soft text-accent-fg hover:border-accent"
              : "border-line bg-surface text-muted hover:border-accent/50 hover:text-ink")
          }
        >
          <UserIcon size={16} />
          {member ? (
            <>
              <span className="hidden max-w-[10rem] truncate sm:inline">
                {member.name} 様
              </span>
              <span className="font-semibold tabular-nums text-accent">
                {member.pointsBalance.toLocaleString("ja-JP")}pt
              </span>
            </>
          ) : (
            <span className="hidden sm:inline">マイページ</span>
          )}
        </a>
        <button
          type="button"
          onClick={openCart}
          aria-label={`カートを開く（${count}点）`}
          className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-ink transition-colors hover:border-accent/50 hover:text-accent"
        >
          <CartIcon size={18} />
          {count > 0 && (
            <span
              key={count}
              className="absolute -right-1 -top-1 flex h-5 min-w-5 animate-pop items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-fg"
            >
              {count}
            </span>
          )}
        </button>
      </div>
    </header>
  );
}
