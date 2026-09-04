import type { StorefrontShop } from "@/feature/storefront/services/getStorefront";
import type { PublicCoupon } from "@/feature/coupon/services/getCoupons";
import { CouponBanner } from "@/feature/storefront/components/CouponBanner";
import {
  StoreIcon,
  TruckIcon,
  CoinIcon,
  SparkleIcon,
} from "@/feature/storefront/components/icons";
import { formatYen } from "@/helper/utils/retail";

/** 販売ページ上部のヒーロー（店名・紹介文・特典）+ お知らせ + 公開クーポン。 */
export function StoreHero({
  shop,
  coupons,
}: {
  shop: StorefrontShop;
  coupons: PublicCoupon[];
}) {
  const title = shop.storeTitle || `${shop.name} オンラインストア`;
  const benefits: { icon: React.ReactNode; label: string }[] = [
    { icon: <StoreIcon size={15} />, label: "店頭受取OK" },
  ];
  if (shop.shippingFee === 0) {
    benefits.push({ icon: <TruckIcon size={15} />, label: "全国送料無料" });
  } else if (shop.freeShippingThreshold > 0) {
    benefits.push({
      icon: <TruckIcon size={15} />,
      label: `${formatYen(shop.freeShippingThreshold)}以上で送料無料`,
    });
  } else {
    benefits.push({
      icon: <TruckIcon size={15} />,
      label: `配送 ${formatYen(shop.shippingFee)}`,
    });
  }
  if (shop.pointRatePercent > 0) {
    benefits.push({
      icon: <CoinIcon size={15} />,
      label: `ポイント${shop.pointRatePercent}%還元`,
    });
  }
  if (shop.allowPointRedeem) {
    benefits.push({
      icon: <SparkleIcon size={15} />,
      label: "ポイントでお支払いOK",
    });
  }

  const hero = shop.storeHeroImageUrl;

  return (
    <div>
      <section
        className="relative overflow-hidden rounded-3xl border border-line bg-surface shadow-panel"
        style={
          hero
            ? {
                backgroundImage: `url(${hero})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }
            : undefined
        }
      >
        {!hero && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(193,154,91,0.18),transparent_60%)]"
          />
        )}
        <div
          className={
            "relative px-6 py-10 text-center sm:px-10 sm:py-14 " +
            (hero ? "bg-surface/85 backdrop-blur-sm" : "")
          }
        >
          <p className="text-[11px] uppercase tracking-[0.35em] text-faint">
            Online Store
          </p>
          <h1 className="mt-2 font-display text-3xl tracking-[0.12em] text-ink sm:text-4xl">
            {title}
          </h1>
          {shop.storeDescription && (
            <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-muted">
              {shop.storeDescription}
            </p>
          )}
          <ul className="mt-6 flex flex-wrap justify-center gap-2">
            {benefits.map((b) => (
              <li
                key={b.label}
                className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent-soft px-3 py-1 text-xs font-medium text-accent-fg"
              >
                <span className="text-accent">{b.icon}</span>
                {b.label}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {shop.storeAnnouncement && (
        <p className="mt-3 rounded-2xl border border-accent/30 bg-accent-soft/70 px-4 py-3 text-center text-sm leading-relaxed text-accent-fg">
          {shop.storeAnnouncement}
        </p>
      )}

      <CouponBanner coupons={coupons} />
    </div>
  );
}
