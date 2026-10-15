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
import { CartIcon, LeafIcon, UserIcon } from "@/feature/storefront/components/icons";

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
  const [scrolled, setScrolled] = useState(false);

  // 少しスクロールしたら下線と影を出す（最上部ではヘッダーを地に溶け込ませる）
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

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
    <header
      className={
        "sticky top-0 z-40 transition-[background-color,box-shadow,border-color] duration-500 " +
        (scrolled
          ? "border-b border-line/70 bg-base/85 shadow-[0_8px_24px_-18px_rgba(45,51,41,0.35)] backdrop-blur-md"
          : "border-b border-transparent bg-base/60 backdrop-blur-sm")
      }
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4 sm:h-[4.5rem] sm:gap-3 sm:px-6">
        <a
          href={`/shop/${slug}`}
          className="group flex min-w-0 flex-1 items-center gap-2"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-accent-fg transition-transform duration-700 ease-silk group-hover:rotate-[20deg]">
            <LeafIcon size={15} />
          </span>
          <span className="truncate font-display text-[15px] font-semibold tracking-[0.16em] text-ink sm:text-lg">
            {title}
          </span>
        </a>
        <a
          href={`/shop/${slug}/member`}
          className={
            "flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs transition-colors " +
            (member
              ? "bg-accent-soft text-accent-hover hover:bg-accent hover:text-accent-fg"
              : "text-muted hover:bg-elevated hover:text-ink")
          }
        >
          <UserIcon size={17} />
          {member ? (
            <>
              <span className="hidden max-w-[10rem] truncate sm:inline">
                {member.name} 様
              </span>
              <span className="font-semibold tabular-nums">
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
          className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink transition-colors hover:bg-elevated"
        >
          <CartIcon size={19} />
          {count > 0 && (
            <span
              key={count}
              className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 animate-pop items-center justify-center rounded-full bg-clay px-1 text-[10px] font-bold text-white"
            >
              {count}
            </span>
          )}
        </button>
      </div>
    </header>
  );
}
