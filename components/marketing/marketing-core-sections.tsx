import Link from "next/link";

import { ArrowRight } from "@/lib/icons";
import { PLATFORM_BRAND_NAME } from "@/lib/platform/brand";
import {
  audienceSignals,
  proofStats,
  trustClaims,
  valuePillars,
  verticalCards,
} from "@/components/marketing/marketing-data";
import { Button } from "@/components/ui/button";
import styles from "@/components/marketing/marketing-site.module.css";

const sectors = ["Gold Operations", "Schools", "Retail & POS", "Auto Sales", "Scrap & Recycling", "Multi-site Admin"];

const platformFeatures = [
  {
    eyebrow: "Foundation rails",
    title: "One core. Every sector builds on it.",
    body: "Identity, tenancy, branding, documents, and notifications are shared across every pack. A new sector doesn't mean a new stack.",
    points: [
      "Tenant-aware host routing and workspace scoping",
      "Role-based permissions across every module",
      "Versioned PDF rendering and document artifacts",
      "Notification and template infrastructure shared",
    ],
    visual: [
      { label: "Identity & auth", value: "Shared", badge: "Core", badgeStyle: "green" as const },
      { label: "Tenant routing", value: "Active", badge: "Live", badgeStyle: "green" as const },
      { label: "Branding engine", value: "Per-company", badge: "Configurable", badgeStyle: "blue" as const },
      { label: "Document render", value: "Versioned", badge: "Live", badgeStyle: "green" as const },
    ],
  },
  {
    eyebrow: "Vertical packs",
    title: "Deep enough for every sector.",
    body: "Gold, schools, retail, auto sales, and scrap each get a focused pack. The operating vocabulary changes. The core stays fixed.",
    points: [
      "Gold: chain of custody, purchases, dispatches, payouts",
      "Schools: admissions, fees, attendance, boarding, portals",
      "Retail: catalog, POS, stock, cashier control, shift close",
      "Scrap & Auto: buy discipline, inventory, deal progression",
    ],
    visual: [
      { label: "Gold pack", value: "Live", badge: "Production", badgeStyle: "green" as const },
      { label: "Schools pack", value: "Live", badge: "Production", badgeStyle: "green" as const },
      { label: "Retail pack", value: "Live", badge: "Production", badgeStyle: "green" as const },
      { label: "Scrap & Auto", value: "Live", badge: "Production", badgeStyle: "green" as const },
    ],
  },
];

export function MarketingCoreSections() {
  return (
    <>
      {/* Sector strip */}
      <div className={styles.sectorStrip}>
        <div className={styles.sectorStripInner}>
          <span className={styles.sectorStripLabel}>Built for</span>
          <div className={styles.sectorList}>
            {sectors.map((s) => (
              <span key={s} className={styles.sectorItem}>{s}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Verticals grid */}
      <section className={styles.sectionAlt}>
        <div className={styles.sectionContainer}>
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.eyebrow}>
                <span className={styles.eyebrowDot} />
                Operating coverage
              </p>
              <h2 className={`${styles.sectionTitle} mt-3`}>
                Specific coverage.{" "}
                <span className={styles.gradientText}>One product.</span>
              </h2>
            </div>
            <p className={styles.sectionSubtext}>
              Each pack stays opinionated about the operating model without turning the platform into a bundle of separate apps.
            </p>
          </div>

          <div className={styles.verticalGrid}>
            {verticalCards.map((card) => {
              const Icon = card.icon;
              return (
                <article key={card.title} className={styles.verticalCard}>
                  <div className={styles.verticalCardIcon}>
                    <Icon className="size-5" />
                  </div>
                  <p className={styles.verticalCardTitle}>{card.title}</p>
                  <p className={styles.verticalCardDesc}>{card.description}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* Platform feature rows */}
      <section>
        <div className={styles.sectionContainer}>
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.eyebrow}>
                <span className={styles.eyebrowDot} />
                Platform
              </p>
              <h2 className={`${styles.sectionTitle} mt-3`}>
                <span className={styles.gradientText}>One control plane.</span>{" "}
                A few strong rails.
              </h2>
            </div>
            <p className={styles.sectionSubtext}>
              Start with one pack, keep the same core, and expand without rebuilding the stack.
            </p>
          </div>

          <div style={{ display: "grid", gap: "5rem" }}>
            {platformFeatures.map((feature, index) => (
              <div
                key={feature.eyebrow}
                className={`${styles.featureRow} ${index % 2 === 1 ? styles.featureRowReverse : ""}`}
              >
                {/* Content */}
                <div className={styles.featureContent}>
                  <p className={styles.eyebrow}>
                    <span className={styles.eyebrowDot} />
                    {feature.eyebrow}
                  </p>
                  <h3 className={styles.featureTitle}>{feature.title}</h3>
                  <p className={styles.featureBody}>{feature.body}</p>
                  <div className={styles.featurePoints}>
                    {feature.points.map((point) => (
                      <div key={point} className={styles.featurePoint}>
                        <div className={styles.featurePointDot}>
                          <span className={styles.featurePointDotInner} />
                        </div>
                        {point}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Visual */}
                <div className={styles.featureVisual}>
                  <div className={styles.featureVisualBar}>
                    <span className={styles.featureVisualDot} />
                    <span className={styles.featureVisualDot} />
                    <span className={styles.featureVisualDot} />
                    <span className={styles.featureVisualTitle}>{feature.eyebrow}</span>
                  </div>
                  <div className={styles.featureVisualBody}>
                    {feature.visual.map((row) => (
                      <div key={row.label} className={styles.featureDataRow}>
                        <span className={styles.featureDataLabel}>{row.label}</span>
                        <span className={styles.featureDataValue}>{row.value}</span>
                        <span
                          className={`${styles.featureDataBadge} ${
                            row.badgeStyle === "green" ? styles.featureDataBadgeGreen : ""
                          }`}
                        >
                          {row.badge}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats band */}
      <section className={styles.sectionAlt}>
        <div className={styles.sectionContainerTight}>
          <div className={styles.statsBand}>
            {proofStats.map((stat) => (
              <div key={stat.label} className={styles.statCell}>
                <div className={styles.statValue}>{stat.value}</div>
                <div className={styles.statLabel}>{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Value pillars */}
      <section>
        <div className={styles.sectionContainer}>
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.eyebrow}>
                <span className={styles.eyebrowDot} />
                Control pillars
              </p>
              <h2 className={`${styles.sectionTitle} mt-3`}>
                Four reasons it stays{" "}
                <span className={styles.gradientText}>coherent</span>{" "}
                as the org grows.
              </h2>
            </div>
            <p className={styles.sectionSubtext}>
              Operational control, finance integrity, commercial flexibility, and role-specific experiences — built into every pack.
            </p>
          </div>

          <div className={styles.cardGrid}>
            {valuePillars.map((pillar) => {
              const Icon = pillar.icon;
              return (
                <article key={pillar.title} className={`${styles.card} ${styles.cardPadded}`}>
                  <div className={styles.verticalCardIcon}>
                    <Icon className="size-5" />
                  </div>
                  <p className={styles.cardTitle}>{pillar.title}</p>
                  <p className={styles.cardBody}>{pillar.description}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* Live proof */}
      <section className={styles.sectionAlt}>
        <div className={styles.sectionContainer}>
          <div style={{ display: "grid", gap: "3rem", alignItems: "start" }}
            className="lg:grid-cols-[1fr_1.1fr]">
            <div>
              <p className={styles.eyebrow}>
                <span className={styles.eyebrowDot} />
                Live proof
              </p>
              <h2 className={`${styles.sectionTitle} mt-3`}>
                Claims anchored in{" "}
                <span className={styles.gradientText}>shipped capability.</span>
              </h2>
              <p className={`${styles.sectionSubtext} mt-4`}>
                The story stays honest. These are shipped surfaces, not roadmap promises.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button asChild className="rounded-full">
                  <Link href="/home/book-demo">
                    See it live
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
                <Link
                  href="/home/pricing"
                  className="inline-flex items-center text-sm font-medium text-[#1d4ed8] underline-offset-4 hover:underline"
                >
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
        </div>
      </section>

      {/* Best fit */}
      <section>
        <div className={styles.sectionContainer}>
          <div style={{ display: "grid", gap: "2.5rem", alignItems: "end" }}
            className="lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <p className={styles.eyebrow}>
                <span className={styles.eyebrowDot} />
                Best fit
              </p>
              <h2 className={`${styles.sectionTitle} mt-3`}>
                Built for operators with more than one site or workflow.
              </h2>
            </div>
            <div>
              <p className={`${styles.sectionSubtext} mb-4`}>
                {PLATFORM_BRAND_NAME} works when spreadsheets, siloed tools, and handoffs start to slow the business down.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                {audienceSignals.map((signal) => (
                  <span key={signal} className={styles.chip}>{signal}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
