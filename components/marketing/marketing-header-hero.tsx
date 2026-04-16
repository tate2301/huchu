import Link from "next/link";

import { ArrowRight } from "@/lib/icons";
import type { MarketingSiteConfig } from "@/lib/marketing-site";
import { PLATFORM_BRAND_INITIAL, PLATFORM_BRAND_NAME, PLATFORM_MARKETING_DOMAIN } from "@/lib/platform/brand";
import { marketingNavItems, proofStats } from "@/components/marketing/marketing-data";
import styles from "@/components/marketing/marketing-site.module.css";

type MarketingHeaderHeroProps = {
  config: MarketingSiteConfig;
};

const heroMetrics = [
  { name: "Cash-ups completed", fill: "91%", value: "91%" },
  { name: "Open work orders", fill: "12%", value: "3 open" },
  { name: "Audit items cleared", fill: "78%", value: "78%" },
];

const heroSites = [
  { label: "Gold ops", name: "Mine Site 01" },
  { label: "Schools", name: "Campus Alpha" },
  { label: "Retail", name: "Main Branch" },
];

export function MarketingHeaderHero({ config }: MarketingHeaderHeroProps) {
  void config;
  return (
    <>
      {/* Navigation */}
      <header className={styles.nav}>
        <div className={styles.navInner}>
          <Link href="/home" className={styles.navLogo}>
            <span className={styles.navLogoMark}>{PLATFORM_BRAND_INITIAL}</span>
            {PLATFORM_BRAND_NAME}
          </Link>

          <nav className={styles.navLinks} aria-label="Main navigation">
            {marketingNavItems.map((item) => (
              <Link key={item.href} href={item.href} className={styles.navLink}>
                {item.label}
              </Link>
            ))}
          </nav>

          <div className={styles.navActions}>
            <Link href="/login" className={`${styles.navSignIn} hidden sm:inline-flex`}>
              Sign in
            </Link>
            <Link href="/home/book-demo" className={styles.navCta}>
              Book a demo
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className={styles.heroSection} aria-label="Hero">
        <div className={`${styles.heroGlow} ${styles.heroGlowLeft}`} aria-hidden="true" />
        <div className={`${styles.heroGlow} ${styles.heroGlowRight}`} aria-hidden="true" />

        <div className={styles.heroInner}>
          {/* Left — copy */}
          <div className={styles.heroContent}>
            <div className={`${styles.badgePill} ${styles.badgePillDark}`}>
              <span className={styles.heroSiteCardStatusDot} aria-hidden="true" />
              Multi-site operations platform
            </div>

            <h1 className={styles.heroHeadline}>
              One platform.{" "}
              <span className={styles.heroHeadlineAccent}>Every site.</span>{" "}
              Every sector.
            </h1>

            <p className={styles.heroSubtext}>
              Vertical packs for gold, schools, retail, auto sales, and scrap — all on shared accounting, reporting, and administration rails.
            </p>

            <div className={styles.heroCtas}>
              <Link href="/home/book-demo" className={styles.ctaPrimary}>
                Book a live demo
                <ArrowRight className="size-4" />
              </Link>
              <Link href="/home/pricing" className={styles.ctaSecondary}>
                See pricing
              </Link>
            </div>

            <div className={styles.heroProof}>
              {proofStats.slice(0, 3).map((stat, i) => (
                <div key={stat.label} style={{ display: "contents" }}>
                  {i > 0 && <div className={styles.heroProofDivider} aria-hidden="true" />}
                  <div className={styles.heroProofStat}>
                    <span className={styles.heroProofValue}>{stat.value}</span>
                    <span className={styles.heroProofLabel}>{stat.label}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right — product UI mockup */}
          <div className={styles.heroVisual} aria-hidden="true">
            <div className={styles.heroCard}>
              {/* Window bar */}
              <div className={styles.heroCardBar}>
                <span className={styles.heroCardDot} />
                <span className={styles.heroCardDot} />
                <span className={styles.heroCardDot} />
                <div className={styles.heroCardAddress}>{PLATFORM_MARKETING_DOMAIN} / overview</div>
              </div>

              {/* Body */}
              <div className={styles.heroCardBody}>
                {/* Sites grid */}
                <div className={styles.heroCardSection}>
                  <p className={styles.heroCardSectionLabel}>Active sites</p>
                  <div className={styles.heroSiteGrid}>
                    {heroSites.map((site) => (
                      <div key={site.name} className={styles.heroSiteCard}>
                        <p className={styles.heroSiteCardLabel}>{site.label}</p>
                        <p className={styles.heroSiteCardName}>{site.name}</p>
                        <div className={styles.heroSiteCardStatus}>
                          <span className={styles.heroSiteCardStatusDot} />
                          Live
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Metrics */}
                <div className={styles.heroMetricList}>
                  {heroMetrics.map((m) => (
                    <div key={m.name} className={styles.heroMetricRow}>
                      <span className={styles.heroMetricName}>{m.name}</span>
                      <div className={styles.heroMetricBar}>
                        <div
                          className={styles.heroMetricFill}
                          style={{ width: m.fill }}
                        />
                      </div>
                      <span className={styles.heroMetricValue}>{m.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Footer tags */}
              <div className={styles.heroCardFooter}>
                {["Gold", "Schools", "Retail", "Scrap", "Auto", "Admin"].map((tag) => (
                  <span key={tag} className={styles.heroCardTag}>{tag}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
