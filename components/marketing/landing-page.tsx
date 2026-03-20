import Link from "next/link";

import type { MarketingSiteConfig } from "@/lib/marketing-site";
import { MarketingCommercialSections } from "@/components/marketing/marketing-commercial-sections";
import { MarketingCoreSections } from "@/components/marketing/marketing-core-sections";
import { marketingSiteHighlights, rolloutPaths, verticalCards } from "@/components/marketing/marketing-data";
import { MarketingHeaderHero } from "@/components/marketing/marketing-header-hero";
import styles from "@/components/marketing/marketing-site.module.css";

type LandingPageProps = {
  config: MarketingSiteConfig;
};

export function LandingPage({ config }: LandingPageProps) {
  return (
    <div className={`${styles.page} overflow-x-clip text-foreground`}>
      <div className={styles.heroGlowLeft} aria-hidden="true" />
      <div className={styles.heroGlowRight} aria-hidden="true" />
      <main>
        <MarketingHeaderHero config={config} />
        <section className="mx-auto max-w-7xl px-6 pb-4 lg:px-8">
          <div className={styles.marketingQuickNav}>
            <div className={styles.marketingQuickNavLinks}>
              <span className="font-semibold uppercase tracking-[0.18em] text-[#0b1945]">Explore</span>
              <Link href="/home/product" className="transition-colors hover:text-[#0b1945]">
                Platform
              </Link>
              <Link href="/home/solutions" className="transition-colors hover:text-[#0b1945]">
                Solutions
              </Link>
              <Link href="/home/pricing" className="transition-colors hover:text-[#0b1945]">
                Pricing
              </Link>
              <Link href="/home/book-demo" className="transition-colors hover:text-[#0b1945]">
                Book a demo
              </Link>
            </div>
            <div className="flex flex-wrap gap-2.5">
              {marketingSiteHighlights.map((item) => (
                <span key={item} className={styles.productPill}>
                  {item}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 pb-18 pt-6 lg:px-8 lg:pb-24">
          <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
            <div className="space-y-4">
              <p className={styles.stripeEyebrow}>Operating coverage</p>
              <h2 className="max-w-3xl text-[clamp(2.1rem,4.2vw,4rem)] font-semibold leading-[0.96] tracking-[-0.055em] text-[#0b1945] text-balance">
                Different workflows. One commercial and control system.
              </h2>
              <p className="max-w-2xl text-base leading-8 text-[#2d3d66]/82">
                The story should feel broad without becoming vague. These coverage cards show where the platform is already credible today.
              </p>
            </div>
            <div className={styles.rolloutPreviewRail}>
              {rolloutPaths.map((path) => (
                <div key={path.title} className={styles.rolloutPreviewCard}>
                  <p className={styles.productFeatureEyebrow}>{path.title}</p>
                  <p className="mt-2 text-sm leading-7 text-[#31436f]/82">{path.start}</p>
                  <p className="mt-3 font-medium text-[#0f1f55]">{path.expand}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {verticalCards.map((card) => {
              const Icon = card.icon;
              return (
                <article key={card.title} className={styles.verticalCard}>
                  <div className="flex size-11 items-center justify-center rounded-full bg-[#0f1f55] text-white">
                    <Icon className="size-5" />
                  </div>
                  <p className="mt-5 text-xl font-semibold tracking-[-0.03em] text-[#0f1f55]">{card.title}</p>
                  <p className="mt-3 text-sm leading-7 text-[#31436f]/82">{card.description}</p>
                </article>
              );
            })}
          </div>
        </section>
        <MarketingCoreSections />
        <MarketingCommercialSections config={config} />
      </main>
    </div>
  );
}
