import type { StorefrontShop } from "@/feature/storefront/services/getStorefront";
import type { PublicCoupon } from "@/feature/coupon/services/getCoupons";
import { CouponBanner } from "@/feature/storefront/components/CouponBanner";
import { BenefitIcon } from "@/feature/storefront/components/BenefitIcon";
import { ArrowRightIcon, LeafIcon } from "@/feature/storefront/components/icons";
import { storeBenefits } from "@/feature/storefront/lib/benefits";
import { formatMonthDay } from "@/helper/utils/pointCampaign";

/**
 * 販売ページ上部のヒーロー（店名・紹介文・特典・商品写真）+ 期間限定ポイント + お知らせ + 公開クーポン。
 * images: ヒーロー画像（設定があれば）→ おすすめ商品 → その他の商品 の順で最大3枚。
 * 写真が1枚も無い店舗でも成り立つよう、そのときは植物モチーフの図案を出す。
 */
export function StoreHero({
  shop,
  coupons,
  images,
  hasPicks,
}: {
  shop: StorefrontShop;
  coupons: PublicCoupon[];
  images: string[];
  /** 「スタッフのおすすめ」セクションがあるか（2つ目のボタンの行き先） */
  hasPicks: boolean;
}) {
  const title = shop.storeTitle || `${shop.name} オンラインストア`;
  const benefits = storeBenefits(shop).filter((b) => b.kind !== "campaign").slice(0, 3);
  const campaign = shop.pointCampaign;

  return (
    <div>
      <section className="grain relative isolate overflow-hidden rounded-[2rem] border border-line/60 bg-gradient-to-br from-accent-soft via-surface to-clay-soft/70">
        {/* ゆっくり漂う光と葉 */}
        <div
          aria-hidden
          className="pointer-events-none absolute -left-24 -top-28 h-80 w-80 animate-float rounded-full bg-accent/20 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-36 right-0 h-96 w-96 animate-float-slow rounded-full bg-clay/15 blur-3xl"
        />
        <LeafIcon
          size={200}
          strokeWidth={0.6}
          className="pointer-events-none absolute -bottom-12 -left-10 origin-bottom-left animate-sway text-accent/15"
        />

        <div className="relative grid items-center gap-10 px-6 py-12 sm:px-12 sm:py-16 md:grid-cols-[1.1fr_1fr] md:gap-6 lg:px-16 lg:py-20">
          <div className="text-center md:text-left">
            <p className="animate-rise font-accent text-lg italic tracking-[0.3em] text-accent">
              Online Store
            </p>
            <h1 className="mt-3 animate-rise text-balance font-display [word-break:auto-phrase] text-[1.85rem] font-semibold leading-[1.5] tracking-[0.1em] text-ink [animation-delay:120ms] sm:text-[2.6rem] sm:leading-[1.4]">
              {title}
            </h1>
            {shop.storeDescription && (
              <p className="mx-auto mt-5 max-w-md animate-rise text-sm leading-[2] text-muted [animation-delay:240ms] md:mx-0">
                {shop.storeDescription}
              </p>
            )}
            <div className="mt-8 flex animate-rise flex-wrap items-center justify-center gap-3 [animation-delay:360ms] md:justify-start">
              <a
                href="#products"
                className="group inline-flex h-12 items-center gap-2 rounded-full bg-accent px-7 text-sm font-semibold tracking-[0.12em] text-accent-fg shadow-[0_14px_30px_-14px_rgba(68,85,58,0.8)] transition-all duration-500 ease-silk hover:-translate-y-0.5 hover:bg-accent-hover"
              >
                商品を見る
                <ArrowRightIcon
                  size={16}
                  className="transition-transform duration-500 ease-silk group-hover:translate-x-1"
                />
              </a>
              {hasPicks && (
                <a
                  href="#picks"
                  className="inline-flex h-12 items-center rounded-full border border-ink/15 bg-surface/60 px-6 text-sm tracking-[0.08em] text-ink backdrop-blur transition-colors duration-300 hover:border-accent hover:text-accent"
                >
                  スタッフのおすすめ
                </a>
              )}
            </div>
            {benefits.length > 0 && (
              <ul className="mt-8 flex animate-rise flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-muted [animation-delay:480ms] md:justify-start">
                {benefits.map((b) => (
                  <li key={b.kind} className="inline-flex items-center gap-1.5">
                    <BenefitIcon kind={b.kind} size={15} className="text-accent" />
                    {b.label}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <HeroVisual images={images} title={title} />
        </div>
      </section>

      {campaign && (
        <div className="relative mt-4 overflow-hidden rounded-2xl border border-clay/30 bg-clay-soft">
          <div
            aria-hidden
            className="absolute inset-0 animate-shimmer bg-[linear-gradient(110deg,transparent_35%,rgba(255,255,255,0.65)_50%,transparent_65%)] bg-[length:200%_100%]"
          />
          <p className="relative flex flex-col items-center justify-center gap-1 px-5 py-3.5 text-center text-sm text-ink sm:flex-row sm:gap-4">
            <span className="font-accent text-md italic tracking-[0.25em] text-clay">
              Point Up
            </span>
            <span>
              {campaign.label}：{formatMonthDay(campaign.endDate)}まで、お買い物でポイント
              <span className="mx-1 font-accent text-3xl font-semibold leading-none text-clay lining-nums">
                {campaign.ratePercent}
                <span className="text-xl">%</span>
              </span>
              還元
              {campaign.baseRatePercent > 0 && (
                <span className="text-muted">（通常{campaign.baseRatePercent}%）</span>
              )}
            </span>
          </p>
        </div>
      )}

      {shop.storeAnnouncement && (
        <p className="mt-3 flex items-start justify-center gap-2 rounded-2xl border border-line bg-surface/70 px-5 py-3 text-center text-[13px] leading-relaxed text-muted">
          <LeafIcon size={15} className="mt-0.5 shrink-0 text-accent" />
          <span>{shop.storeAnnouncement}</span>
        </p>
      )}

      <CouponBanner coupons={coupons} />
    </div>
  );
}

/** ヒーロー右側。商品写真をアーチ型に切り抜き、残りを円形で浮かべる。 */
function HeroVisual({ images, title }: { images: string[]; title: string }) {
  const [main, second, third] = images;
  return (
    <div className="relative mx-auto flex aspect-square w-full max-w-[22rem] items-center justify-center sm:max-w-[26rem]">
      {/* ゆっくり回る点線の輪 */}
      <div
        aria-hidden
        className="absolute inset-[4%] animate-spin-slow rounded-full border border-dashed border-accent/30"
      />
      <div aria-hidden className="absolute inset-[14%] rounded-full bg-surface/50" />

      {main ? (
        <div className="relative h-[86%] w-[66%] animate-rise overflow-hidden rounded-b-[2.5rem] rounded-t-full shadow-[0_30px_60px_-30px_rgba(45,51,41,0.55)] [animation-delay:200ms]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={main} alt={title} className="h-full w-full animate-settle object-cover" />
        </div>
      ) : (
        <div className="relative flex h-[86%] w-[66%] animate-rise flex-col items-center justify-center gap-3 overflow-hidden rounded-b-[2.5rem] rounded-t-full bg-gradient-to-b from-accent/80 to-accent-hover text-accent-fg shadow-[0_30px_60px_-30px_rgba(45,51,41,0.55)] [animation-delay:200ms]">
          <LeafIcon size={72} strokeWidth={1} className="animate-sway" />
          <span className="font-accent text-xl italic tracking-[0.25em]">Natural Care</span>
        </div>
      )}

      {second && (
        <div className="absolute bottom-[6%] left-[2%] h-[30%] w-[30%] animate-float overflow-hidden rounded-full border-4 border-surface shadow-panel">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={second} alt="" className="h-full w-full object-cover" />
        </div>
      )}
      {third && (
        <div className="absolute right-[2%] top-[8%] h-[24%] w-[24%] animate-float-slow overflow-hidden rounded-full border-4 border-surface shadow-panel">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={third} alt="" className="h-full w-full object-cover" />
        </div>
      )}
      {!second && (
        <span
          aria-hidden
          className="absolute bottom-[10%] left-[6%] flex h-16 w-16 animate-float items-center justify-center rounded-full bg-clay-soft text-clay shadow-panel"
        >
          <LeafIcon size={26} />
        </span>
      )}
    </div>
  );
}
