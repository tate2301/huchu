import Link from "next/link";

import { ArrowRight } from "@/lib/icons";
import type { MarketingSiteConfig } from "@/lib/marketing-site";
import { PLATFORM_BRAND_NAME } from "@/lib/platform/brand";
import {
  addOns,
  featuredAddOns,
  pricingTiers,
  rolloutPaths,
} from "@/components/marketing/marketing-data";
import { DemoBookingForm } from "@/components/marketing/demo-booking-form";
import styles from "@/components/marketing/marketing-site.module.css";

type MarketingCommercialSectionsProps = {
  config: MarketingSiteConfig;
};

export function MarketingCommercialSections({ config }: MarketingCommercialSectionsProps) {
  return (
    <>
      {/* Pricing overview */}
      <section className={styles.sectionAlt}>
        <div className={styles.sectionContainer}>
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.eyebrow}>
                <span className={styles.eyebrowDot} />
                Pricing
              </p>
              <h2 className={`${styles.sectionTitle} mt-3`}>
                Pricing that tracks{" "}
                <span className={styles.gradientText}>rollout scope.</span>
              </h2>
            </div>
            <div>
              <p className={styles.sectionSubtext}>
                USD pricing. Base plans, included sites, and add-ons all map to the live catalog.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link href="/home/pricing" className={styles.ctaPrimary} style={{ background: "#0b1945", color: "#fff" }}>
                  See full pricing
                  <ArrowRight className="size-4" />
                </Link>
                <Link href="/home/book-demo" className={styles.ctaSecondary} style={{ borderColor: "rgba(14,28,66,0.18)", color: "#1d4ed8" }}>
                  Talk through pricing
                </Link>
              </div>
            </div>
          </div>

          {/* Pricing cards */}
          <div className={styles.pricingGrid}>
            {pricingTiers.map((tier, index) => (
              <article
                key={tier.tier}
                className={`${styles.pricingCard} ${index === 1 ? styles.pricingCardFeatured : ""}`}
              >
                <div className={styles.pricingTier}>{tier.stage}</div>
                {index === 1 && (
                  <span className={styles.badgePill} style={{ marginTop: "0.5rem", display: "inline-flex" }}>
                    Most adopted
                  </span>
                )}

                <div className={styles.pricingPrice}>
                  <span
                    className={`${styles.pricingAmount} ${index === 1 ? styles.pricingAmountFeatured : ""}`}
                    style={{ fontFamily: "var(--font-mono, monospace)" }}
                  >
                    {tier.price}
                  </span>
                  <span className={styles.pricingPer}>/ mo</span>
                </div>

                <div className={styles.pricingDivider} />

                <div>
                  <p className={styles.pricingSites}>{tier.sites}</p>
                  <p className={styles.pricingExtra}>{tier.extraSite}</p>
                </div>

                <p className={styles.pricingBestFor}>{tier.bestFor} — {tier.summary}</p>

                <div className={styles.pricingCta}>
                  <Link href="/home/book-demo#demo-form" className={styles.pricingCtaLink}>
                    Use this tier
                  </Link>
                  <span className={styles.pricingCtaNote}>USD</span>
                </div>
              </article>
            ))}
          </div>

          {/* Rollout paths */}
          <div style={{ marginTop: "3rem", paddingTop: "2.5rem", borderTop: "1px solid rgba(14,28,66,0.08)" }}>
            <div style={{ display: "grid", gap: "2rem", alignItems: "end", marginBottom: "1.5rem" }}
              className="lg:grid-cols-[0.7fr_1.3fr]">
              <div>
                <p className={styles.eyebrow}>
                  <span className={styles.eyebrowDot} />
                  How rollout starts
                </p>
                <p className={`${styles.sectionSubtext} mt-2`}>
                  Most teams start with the pack that solves the immediate problem, then layer in finance and compliance.
                </p>
              </div>
            </div>
            <div className={styles.rolloutGrid}>
              {rolloutPaths.map((path) => (
                <div key={path.title} className={styles.rolloutCard}>
                  <p className={styles.rolloutCardLabel}>Rollout path</p>
                  <p className={styles.rolloutCardTitle}>{path.title}</p>
                  <p className={styles.rolloutCardValue}>{path.start}</p>
                  <p className={styles.rolloutCardExpand}>Expand into → {path.expand}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Add-ons */}
          <div style={{ marginTop: "3rem", paddingTop: "2.5rem", borderTop: "1px solid rgba(14,28,66,0.08)" }}>
            <div style={{ display: "grid", gap: "2rem", alignItems: "start" }}
              className="lg:grid-cols-[0.7fr_1.3fr]">
              <div>
                <p className={styles.eyebrow}>
                  <span className={styles.eyebrowDot} />
                  Frequently paired add-ons
                </p>
                <p className={`${styles.sectionSubtext} mt-2`}>
                  Add advanced accounting, CCTV, compliance, maintenance, branding, portals, and vertical depth as needed.
                </p>
              </div>
              <div>
                <div className={styles.addonList}>
                  {featuredAddOns.map((item) => (
                    <div key={item.name} className={styles.addonItem}>
                      <div>
                        <p className={styles.addonName}>{item.name}</p>
                        <p className={styles.addonNote}>{item.note}</p>
                      </div>
                      <p className={styles.addonPrice}>{item.price}</p>
                    </div>
                  ))}
                </div>
                <div className={styles.addonCloud}>
                  {addOns.map((item) => (
                    <span key={item} className={styles.addonTag}>{item}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA / Demo section */}
      <section>
        <div className={styles.sectionContainer}>
          <div className={styles.ctaBlock}>
            <div className={styles.ctaBlockInner}>
              <div>
                <p className={`${styles.eyebrow} ${styles.badgePillDark}`} style={{ marginBottom: "1rem" }}>
                  Demo
                </p>
                <h2 className={styles.ctaBlockTitle}>
                  Show the rollout shape. We&apos;ll map the path.
                </h2>
                <p className={styles.ctaBlockSubtext}>
                  Bring the handoffs, approvals, and sites that matter most. We will shape the session around the workflow and commercial path that fits.
                </p>
                <div className={styles.ctaBlockActions}>
                  <Link href="/home/book-demo" className={styles.ctaPrimary}>
                    Book a live demo
                    <ArrowRight className="size-4" />
                  </Link>
                  <Link href="/home/pricing" className={styles.ctaSecondary}>
                    Review pricing
                  </Link>
                </div>
              </div>
              <div className={styles.demoFormWrap}>
                <div className={styles.demoFormHeader}>
                  <span className={styles.demoFormLabel}>Request details</span>
                  <span className={styles.demoFormBadge}>Reply in one day</span>
                </div>
                <div className={styles.demoFormBody}>
                  <DemoBookingForm schedulerHref={config.schedulerHref} schedulerExternal={config.schedulerExternal} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div className={styles.footerBrand}>
            <p className={styles.footerBrandName}>{PLATFORM_BRAND_NAME}</p>
            <p className={styles.footerBrandDesc}>
              One platform for operations, finance, control, and reporting across mines, schools, shops, dealerships, and multi-site businesses.
            </p>
          </div>
          <nav className={styles.footerLinks} aria-label="Footer navigation">
            <Link href="/home" className={styles.footerLink}>Home</Link>
            <Link href="/home/product" className={styles.footerLink}>Product</Link>
            <Link href="/home/solutions" className={styles.footerLink}>Solutions</Link>
            <Link href="/home/pricing" className={styles.footerLink}>Pricing</Link>
            <Link href="/home/book-demo" className={styles.footerLink}>Demo</Link>
            <Link href="/login" className={styles.footerLink}>Sign in</Link>
          </nav>
        </div>
      </footer>
    </>
  );
}
