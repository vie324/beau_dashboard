import type { Benefit } from "@/feature/storefront/lib/benefits";
import { BenefitIcon } from "@/feature/storefront/components/BenefitIcon";

/**
 * ページ最上部の特典の帯（送料無料の条件・ポイント・店頭受取）。
 * スマホでは横に流れるテロップ、PC では中央に並べて表示する。
 */
export function StoreTopBar({ benefits }: { benefits: Benefit[] }) {
  const items = benefits.map((b) => (
    <span
      key={b.kind}
      className={
        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap " +
        (b.kind === "campaign" ? "font-semibold text-clay-soft" : "")
      }
    >
      <BenefitIcon kind={b.kind} size={13} className="opacity-80" />
      {b.label}
    </span>
  ));

  return (
    <div className="relative overflow-hidden bg-ink text-[11px] tracking-[0.08em] text-surface sm:text-xs">
      {/* スマホ: テロップ（同じ列を2回並べて -50% まで流すと継ぎ目なく回る） */}
      <div className="flex py-2 md:hidden" aria-hidden>
        <div className="flex shrink-0 animate-marquee">
          {[0, 1].map((copy) => (
            <div key={copy} className="flex shrink-0 items-center gap-8 pr-8">
              {items}
            </div>
          ))}
        </div>
      </div>
      <p className="sr-only">{benefits.map((b) => b.label).join("／")}</p>
      {/* PC: 中央に並べる */}
      <div className="mx-auto hidden max-w-6xl items-center justify-center gap-x-8 px-6 py-2.5 md:flex">
        {items}
      </div>
    </div>
  );
}
