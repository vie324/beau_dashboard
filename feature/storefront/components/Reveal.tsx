"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/helper/utils/cn";

/**
 * スクロールで画面に入ったときに、下からふわっと表示する（販売ページ用）。
 *
 * 最初の描画では何も隠さず、マウント後に「まだ画面の下にある」要素だけを
 * いったん隠して（.reveal-pending）、見えた時点で戻す。読み込み直後に画面内に
 * あるものはそのまま表示されるので、ちらつかず、JS が無くても内容は見える。
 * 動きを減らす設定（prefers-reduced-motion）のときは何もしない。
 */
export function Reveal({
  children,
  className,
  delay = 0,
  id,
}: {
  children: ReactNode;
  className?: string;
  /** 表示の遅延（ms）。並んだカードを少しずつずらして出すのに使う */
  delay?: number;
  id?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.95) return;

    el.classList.add("reveal-pending");
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          el.classList.remove("reveal-pending");
          obs.disconnect();
        }
      },
      { rootMargin: "0px 0px -6% 0px", threshold: 0.01 },
    );
    obs.observe(el);
    return () => {
      obs.disconnect();
      el.classList.remove("reveal-pending");
    };
  }, []);

  return (
    <div
      ref={ref}
      id={id}
      className={cn("reveal", className)}
      style={delay ? ({ "--reveal-delay": `${delay}ms` } as CSSProperties) : undefined}
    >
      {children}
    </div>
  );
}
