import type { Metadata } from "next";
import Link from "next/link";

import { ArrowRight } from "@/lib/icons";
import { PLATFORM_BRAND_NAME } from "@/lib/platform/brand";
import { MarketingSubpageShell } from "@/components/marketing/marketing-subpage-shell";
import {
  addOns,
  featuredAddOns,
  pricingSelectionNotes,
  pricingTiers,
  rolloutPaths,
} from "@/components/marketing/marketing-data";
import { Button } from "@/components/ui/button";
import styles from "@/components/marketing/marketing-site.module.css";

export const metadata: Metadata = {
  title: "Pricing",
  description: `Review ${PLATFORM_BRAND_NAME} pricing tiers and add-on structure for multi-site operators, grounded in the live commercial catalog.`,
};

export default function PricingPage() {
  return (
    <MarketingSubpageShell
      title="Pricing shaped around rollout scope."
      description="USD pricing. Tiers map to rollout shape. Start narrow, then expand."
      pageName="Pricing"
    >
      {/* Intro + selection notes */}
      <section>
        <div style={{ display: "grid", gap: "3rem", alignItems: "start" }}
          className="lg:grid-cols-[1fr_1fr]">
          <div>
            <p className={styles.eyebrow}>
              <span className={styles.eyebrowDot} />
              Commercial model
            </p>
            <h2 className={`${styles.featureTitle} mt-3`}>
              Simple plans, clear site math,{" "}
              <span className={styles.gradientText}>room to expand.</span>
            </h2>
            <div className={styles.stepsList} style={{ marginTop: "1.5rem" }}>
              {pricingSelectionNotes.map((note, i) => (
                <div key={note} className={styles.stepsItem}>
                  <span className={styles.stepsIndex}>0{i + 1}</span>
                  <span className={styles.stepsText}>{note}</span>
                </div>
              ))}
            </div>
          </div>

          <div className={`${styles.card} ${styles.cardPadded}`}>
            <p className={styles.cardEyebrow}>Commercial facts</p>
            <div style={{ display: "grid", gap: "0.75rem", gridTemplateColumns: "1fr", marginTop: "1rem" }}>
              {[
                { label: "Tiers", value: "3 tiers with site math" },
                { label: "Add-ons", value: "20 add-on bundles" },
                { label: "Currency", value: "USD pricing" },
              ].map((item) => (
                <div key={item.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.65rem 0", borderBottom: "1px solid rgba(14,28,66,0.07)" }}>
                  <span className={styles.cardEyebrow}>{item.label}</span>
                  <span className={styles.cardTitle} style={{ marginTop: 0 }}>{item.value}</span>
                </div>
              ))}
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button asChild className="rounded-full">
                <Link href="/home/book-demo#demo-form">
                  Talk through your rollout
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Link href="#add-ons" className="inline-flex items-center text-sm font-medium text-[#1d4ed8] underline-offset-4 hover:underline">
                Review add-ons
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing cards */}
      <section style={{ marginTop: "3.5rem" }}>
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

              <p className={styles.pricingBestFor}>
                <strong>{tier.bestFor}</strong> — {tier.summary} {tier.detail}
              </p>

              <div className={styles.pricingCta}>
                <Link href="/home/book-demo#demo-form" className={styles.pricingCtaLink}>
                  Use this tier
                </Link>
                <span className={styles.pricingCtaNote}>USD</span>
              </div>
            </article>
          ))}
        </div>
        <p style={{ marginTop: "1.25rem", fontSize: "0.84rem", color: "rgba(60,80,130,0.68)", lineHeight: "1.65" }}>
          Additional-site pricing makes rollout scope legible before procurement starts — especially useful for branch-heavy or phased deployments.
        </p>
      </section>

      {/* Rollout paths */}
      <section style={{ marginTop: "4rem", paddingTop: "3rem", borderTop: "1px solid rgba(14,28,66,0.08)" }}>
        <div style={{ display: "grid", gap: "2rem", alignItems: "end", marginBottom: "1.5rem" }}
          className="lg:grid-cols-[0.7fr_1.3fr]">
          <div>
            <p className={styles.eyebrow}>
              <span className={styles.eyebrowDot} />
              How rollout starts
            </p>
            <p className={`${styles.sectionSubtext} mt-2`}>
              Most teams start with the smallest pack that solves the problem now.
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
      </section>

      {/* Add-ons */}
      <section id="add-ons" style={{ marginTop: "4rem", paddingTop: "3rem", borderTop: "1px solid rgba(14,28,66,0.08)" }}>
        <div style={{ display: "grid", gap: "3rem", alignItems: "start" }}
          className="lg:grid-cols-[0.72fr_1.28fr]">
          <div>
            <p className={styles.eyebrow}>
              <span className={styles.eyebrowDot} />
              Add-ons
            </p>
            <h2 className={`${styles.featureTitle} mt-3`}>
              Layer in what the{" "}
              <span className={styles.gradientText}>rollout needs</span>{" "}
              next.
            </h2>
            <p className={`${styles.featureBody} mt-3`}>
              Start narrow, then add finance, compliance, portals, or depth.
            </p>
          </div>

          <div>
            <div className={`${styles.card} ${styles.cardPadded}`}>
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
      </section>

      {/* Closing CTA */}
      <section style={{ marginTop: "4rem" }}>
        <div className={styles.ctaBlock}>
          <div className={styles.ctaBlockInner}>
            <div>
              <h2 className={styles.ctaBlockTitle}>
                We can map your sites, controls, and add-ons into a phased plan.
              </h2>
              <p className={styles.ctaBlockSubtext}>
                Bring the footprint and workflows. We will turn that into a recommended pack and rollout sequence.
              </p>
              <div className={styles.ctaBlockActions}>
                <Link href="/home/book-demo#demo-form" className={styles.ctaPrimary}>
                  Book a pricing walkthrough
                  <ArrowRight className="size-4" />
                </Link>
                <Link href="/home/book-demo" className={styles.ctaSecondary}>
                  Open demo page
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </MarketingSubpageShell>
  );
}
