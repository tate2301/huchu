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
        <MarketingCoreSections />
        <MarketingCommercialSections config={config} />
      </main>
    </div>
  );
}
