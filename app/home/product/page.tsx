import Link from "next/link";
import type { Metadata } from "next";

import { ArrowRight } from "@/lib/icons";
import { PLATFORM_BRAND_NAME } from "@/lib/platform/brand";
import {
  proofStats,
  productSteps,
  showcaseCards,
  trustClaims,
  valuePillars,
} from "@/components/marketing/marketing-data";
import { MarketingSubpageShell } from "@/components/marketing/marketing-subpage-shell";
import { Button } from "@/components/ui/button";
import styles from "@/components/marketing/marketing-site.module.css";

export const metadata: Metadata = {
  title: "Product",
  description: `Explore the ${PLATFORM_BRAND_NAME} product model: one shared control plane across vertical packs.`,
};

const productLayers = [
  {
    eyebrow: "Foundation rails",
    title: "Identity, tenancy, branding, documents, and notifications stay fixed.",
    copy: "Every pack inherits the same account and permission model.",
  },
  {
    eyebrow: "Vertical packs",
    title: "Gold, schools, retail, scrap, and autos ship as focused surfaces.",
    copy: "Each pack changes the vocabulary, not the core model.",
  },
  {
    eyebrow: "Control surfaces",
    title: "Admin, support, and reliability tooling stay in the loop.",
    copy: "Operators review companies, subscriptions, features, and incidents in one place.",
  },
  {
    eyebrow: "Commercial layer",
    title: "Bundles and add-ons mirror the rollout path.",
    copy: "The commercial story follows how customers adopt the platform.",
  },
];

export default function ProductPage() {
  return (
    <MarketingSubpageShell
      title="One shared control plane."
      description="Start with one pack, keep the same core, and expand without rebuilding the stack."
      pageName="Product"
      pills={["Shared rails", "Pack-by-pack rollout", "Commercially aligned"]}
    >
      {/* How it holds together */}
      <section>
        <div style={{ display: "grid", gap: "3rem", alignItems: "start" }}
          className="lg:grid-cols-[1fr_1.1fr]">
          <div>
            <p className={styles.eyebrow}>
              <span className={styles.eyebrowDot} />
              Rollout sequence
            </p>
            <h2 className={`${styles.featureTitle} mt-3`}>
              Same rails.{" "}
              <span className={styles.gradientText}>Different workflows.</span>
            </h2>
            <div className={`${styles.card} ${styles.cardPadded} mt-5`}>
              <div className={styles.stepsList}>
                {productSteps.map((step, index) => (
                  <div key={step} className={styles.stepsItem}>
                    <span className={styles.stepsIndex}>0{index + 1}</span>
                    <span className={styles.stepsText}>{step}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className={`${styles.card} mt-0`}>
            <div style={{ padding: "1.25rem 1.25rem 0", borderBottom: "1px solid rgba(14,28,66,0.07)" }}>
              <p className={styles.cardEyebrow}>How it holds together</p>
              <p className={styles.cardTitle} style={{ marginBottom: "1rem" }}>One product. Fewer moving parts.</p>
            </div>
            <div style={{ padding: "1rem", display: "grid", gap: "0.75rem" }}>
              {productLayers.map((layer) => (
                <div key={layer.eyebrow} style={{ borderRadius: "12px", border: "1px solid rgba(14,28,66,0.07)", background: "rgba(248,250,255,0.6)", padding: "1rem" }}>
                  <p className={styles.cardEyebrow}>{layer.eyebrow}</p>
                  <p className={styles.cardTitle}>{layer.title}</p>
                  <p className={styles.cardBody}>{layer.copy}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section style={{ marginTop: "4rem" }}>
        <div className={styles.statsBand}>
          {proofStats.map((stat) => (
            <div key={stat.label} className={styles.statCell}>
              <div className={styles.statValue}>{stat.value}</div>
              <div className={styles.statLabel}>{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Sector proof */}
      <section style={{ marginTop: "5rem" }}>
        <p className={styles.eyebrow}>
          <span className={styles.eyebrowDot} />
          Sector proof
        </p>
        <h2 className={`${styles.featureTitle} mt-3`} style={{ marginBottom: "2rem" }}>
          Proof by{" "}
          <span className={styles.gradientText}>sector.</span>
        </h2>
        <div className={styles.cardGrid}>
          {showcaseCards.map((card) => (
            <article key={card.eyebrow} className={`${styles.card} ${styles.cardPadded}`}>
              <p className={styles.cardEyebrow}>{card.eyebrow}</p>
              <p className={styles.cardTitle}>{card.title}</p>
              <p className={styles.cardBody}>{card.copy}</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginTop: "1rem" }}>
                {card.chips.map((chip) => (
                  <span key={chip} className={styles.chip}>{chip}</span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Value pillars */}
      <section style={{ marginTop: "5rem" }}>
        <div style={{ display: "grid", gap: "2.5rem", alignItems: "start" }}
          className="lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className={styles.eyebrow}>
              <span className={styles.eyebrowDot} />
              Control pillars
            </p>
            <h2 className={`${styles.featureTitle} mt-3`}>
              Four reasons it still feels like{" "}
              <span className={styles.gradientText}>one product.</span>
            </h2>
          </div>
          <div className={styles.cardGridCols2} style={{ display: "grid", gap: "1rem" }}>
            {valuePillars.map((pillar) => {
              const Icon = pillar.icon;
              return (
                <div key={pillar.title} className={`${styles.card} ${styles.cardPadded}`}>
                  <div className={styles.verticalCardIcon}>
                    <Icon className="size-5" />
                  </div>
                  <p className={styles.cardTitle}>{pillar.title}</p>
                  <p className={styles.cardBody}>{pillar.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Live proof */}
      <section style={{ marginTop: "5rem" }}>
        <div style={{ display: "grid", gap: "3rem", alignItems: "start" }}
          className="lg:grid-cols-[1fr_1.05fr]">
          <div>
            <p className={styles.eyebrow}>
              <span className={styles.eyebrowDot} />
              Live proof
            </p>
            <h2 className={`${styles.featureTitle} mt-3`}>
              Claims grounded in{" "}
              <span className={styles.gradientText}>shipped capability.</span>
            </h2>
            <p className={`${styles.featureBody} mt-3`}>These claims are in production now.</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button asChild className="rounded-full">
                <Link href="/home/book-demo">
                  See it live
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Link href="/home/pricing" className="inline-flex items-center text-sm font-medium text-[#1d4ed8] underline-offset-4 hover:underline">
                Review pricing
              </Link>
            </div>
          </div>
          <div className={styles.proofCard}>
            <div className={styles.proofList}>
              {trustClaims.map((claim) => (
                <div key={claim} className={styles.proofItem}>
                  <div className={styles.proofItemCheck}>
                    <span className={styles.proofItemCheckInner} />
                  </div>
                  {claim}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </MarketingSubpageShell>
  );
}
