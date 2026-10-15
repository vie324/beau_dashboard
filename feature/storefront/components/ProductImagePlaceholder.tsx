import { LeafIcon } from "@/feature/storefront/components/icons";

/** 商品写真が未登録のときの図案（葉のモチーフ + 商品名の頭文字）。 */
export function ProductImagePlaceholder({
  name,
  size = "md",
}: {
  name: string;
  size?: "sm" | "md" | "lg";
}) {
  const initial = Array.from(name.trim())[0] ?? "";
  const big = size === "lg";
  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-accent-soft via-elevated to-clay-soft/70">
      <LeafIcon
        size={big ? 260 : size === "sm" ? 90 : 150}
        strokeWidth={0.6}
        className="absolute -bottom-6 -right-6 text-accent/15"
      />
      <span
        className={
          "relative font-display text-accent/70 " +
          (big ? "text-6xl" : size === "sm" ? "text-xl" : "text-4xl")
        }
      >
        {initial}
      </span>
      {size !== "sm" && (
        <span className="relative mt-2 font-accent text-xs italic tracking-[0.25em] text-faint">
          Photo coming soon
        </span>
      )}
    </div>
  );
}
