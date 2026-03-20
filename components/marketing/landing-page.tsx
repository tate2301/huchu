import Link from "next/link";

import type { MarketingSiteConfig } from "@/lib/marketing-site";
import { MarketingCommercialSections } from "@/components/marketing/marketing-commercial-sections";
import { MarketingCoreSections } from "@/components/marketing/marketing-core-sections";
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
          <div className="flex flex-wrap items-center gap-3 border-y border-[#d6def5] py-4 text-sm text-[#38507d]/78">
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
        </section>
        <MarketingCoreSections />
        <MarketingCommercialSections config={config} />
      </main>
    </div>
  );
}
