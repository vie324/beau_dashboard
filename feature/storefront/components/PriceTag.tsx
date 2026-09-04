import { cn } from "@/helper/utils/cn";
import { formatYen, taxInclusiveUnit } from "@/helper/utils/retail";

/**
 * 税込価格の表示。通常価格（compareAtPrice）が販売価格より高いときは
 * 打消し線付きで併記し、販売価格を強調色にする（セール表示）。
 */
export function PriceTag({
  price,
  compareAtPrice,
  taxRate,
  size = "md",
  className,
}: {
  price: number;
  compareAtPrice?: number | null;
  taxRate: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const incl = taxInclusiveUnit(price, taxRate);
  const cmp =
    compareAtPrice && compareAtPrice > price
      ? taxInclusiveUnit(compareAtPrice, taxRate)
      : null;
  const sizeCls =
    size === "lg" ? "text-2xl" : size === "sm" ? "text-sm" : "text-md";
  return (
    <div className={cn("flex flex-wrap items-baseline gap-x-1.5", className)}>
      {cmp != null && (
        <span className="text-xs tabular-nums text-faint line-through">
          {formatYen(cmp)}
        </span>
      )}
      <span
        className={cn(
          "font-bold tabular-nums",
          cmp != null ? "text-danger" : "text-ink",
          sizeCls,
        )}
      >
        {formatYen(incl)}
      </span>
      <span className="text-[10px] text-faint">税込</span>
    </div>
  );
}
