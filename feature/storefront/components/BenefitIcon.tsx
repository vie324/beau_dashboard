import type { BenefitKind } from "@/feature/storefront/lib/benefits";
import {
  CoinIcon,
  LeafIcon,
  SparkleIcon,
  StoreIcon,
  TruckIcon,
} from "@/feature/storefront/components/icons";

/** 特典の種類ごとのアイコン。 */
export function BenefitIcon({
  kind,
  size = 16,
  className,
}: {
  kind: BenefitKind;
  size?: number;
  className?: string;
}) {
  const p = { size, className };
  switch (kind) {
    case "shipping":
      return <TruckIcon {...p} />;
    case "points":
      return <CoinIcon {...p} />;
    case "campaign":
      return <LeafIcon {...p} />;
    case "pickup":
      return <StoreIcon {...p} />;
    case "redeem":
      return <SparkleIcon {...p} />;
  }
}
