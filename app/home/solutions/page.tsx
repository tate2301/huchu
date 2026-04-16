import Link from "next/link";
import type { Metadata } from "next";

import { ArrowRight } from "@/lib/icons";
import { PLATFORM_BRAND_NAME } from "@/lib/platform/brand";
import { audienceSignals, demoHighlights, solutionStories } from "@/components/marketing/marketing-data";
import { MarketingSubpageShell } from "@/components/marketing/marketing-subpage-shell";
import { Button } from "@/components/ui/button";
import styles from "@/components/marketing/marketing-site.module.css";

export const metadata: Metadata = {
  title: "Solutions",
  description: `See how ${PLATFORM_BRAND_NAME} supports gold, schools, retail, and platform admin on one shared control plane.`,
};

export default function SolutionsPage() {
  return (
    <MarketingSubpageShell
      title="Sector solutions, not disconnected products."
      description="The product stays fixed. The story changes by buyer."
      pageName="Solutions"
      pills={["Gold", "Schools", "Retail", "Platform admin"]}
    >
      {/* Best fit signals */}
      <section>
        <div style={{ display: "grid", gap: "3rem", alignItems: "start" }}
          className="lg:grid-cols-[1fr_1fr]">
          <div>
            <p className={styles.eyebrow}>
              <span className={styles.eyebrowDot} />
              One platform, different operating realities
            </p>
            <h2 className={`${styles.featureTitle} mt-3`}>
              Buyers want the{" "}
              <span className={styles.gradientText}>operating problem</span>{" "}
              first, then the software.
            </h2>
          </div>
          <div>
            <p className={styles.cardEyebrow} style={{ marginBottom: "0.85rem" }}>Best fit signals</p>
            <div className={styles.signalGrid}>
              {audienceSignals.map((signal) => (
                <div key={signal} className={styles.signalCard}>
                  <span className={styles.signalDot} aria-hidden="true" />
                  {signal}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Solution stories */}
      <section style={{ marginTop: "5rem" }}>
        <div className={styles.solutionGrid}>
          {solutionStories.map((row, index) => (
            <article
              key={row.eyebrow}
              className={`${styles.solutionRow} ${index % 2 === 1 ? styles.solutionRowReverse : ""}`}
            >
              {/* Content */}
              <div className={styles.solutionContent}>
                <p className={styles.eyebrow}>
                  <span className={styles.eyebrowDot} />
                  {row.eyebrow}
                </p>
                <h3 className={styles.solutionTitle}>{row.title}</h3>
                <p className={styles.solutionBody}>{row.copy}</p>
                <p className={styles.solutionSignal}>{row.signal}</p>
                <div className={styles.solutionPoints}>
                  {row.points.map((point) => (
                    <div key={point} className={styles.solutionPoint}>{point}</div>
                  ))}
                </div>
              </div>

              {/* Visual */}
              <div className={styles.solutionVisual}>
                <div className={styles.solutionVisualBar}>
                  <span className={styles.solutionVisualDot} />
                  <span className={styles.solutionVisualDot} />
                  <span className={styles.solutionVisualDot} />
                  <span className={styles.solutionVisualTag}>Live workflow</span>
                </div>
                <div className={styles.solutionVisualBody}>
                  <div style={{ display: "grid", gap: "0.5rem", gridTemplateColumns: "1fr 1fr" }}>
                    {row.outcomes.map((outcome) => (
                      <div key={outcome} className={styles.solutionOutcomeCard}>
                        <p className={styles.solutionOutcomeLabel}>Outcome</p>
                        <p className={styles.solutionOutcomeValue}>{outcome}</p>
                      </div>
                    ))}
                  </div>
                  <div className={styles.solutionPathRow}>
                    <div className={styles.solutionPathCard}>
                      <p className={styles.solutionPathLabel}>Start with</p>
                      <p className={styles.solutionPathValue}>{row.start}</p>
                    </div>
                    <div className={styles.solutionPathCard}>
                      <p className={styles.solutionPathLabel}>Expand into</p>
                      <p className={styles.solutionPathValue}>{row.expand}</p>
                    </div>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Rollout fit */}
      <section style={{ marginTop: "5rem" }}>
        <div style={{ display: "grid", gap: "3rem", alignItems: "start" }}
          className="lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className={styles.eyebrow}>
              <span className={styles.eyebrowDot} />
              Rollout fit
            </p>
            <h2 className={`${styles.featureTitle} mt-3`}>
              Show the{" "}
              <span className={styles.gradientText}>next step.</span>
            </h2>
            <p className={`${styles.featureBody} mt-3`}>
              Good deployment stories show what starts first and what comes next.
            </p>
          </div>

          <div>
            <div className={`${styles.card} ${styles.cardPadded}`}>
              <div style={{ display: "grid", gap: "0.75rem", gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
                {demoHighlights.map((item, index) => (
                  <div key={item} style={{ borderRadius: "12px", border: "1px solid rgba(14,28,66,0.07)", background: "rgba(248,250,255,0.6)", padding: "0.85rem 1rem" }}>
                    <p className={styles.cardEyebrow} style={{ fontFamily: "var(--font-mono, monospace)" }}>0{index + 1}</p>
                    <p className={styles.cardBody} style={{ marginTop: "0.4rem" }}>{item}</p>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem", marginTop: "1.25rem", paddingTop: "1.25rem", borderTop: "1px solid rgba(14,28,66,0.07)" }}>
                {audienceSignals.map((signal) => (
                  <span key={signal} className={styles.chip}>{signal}</span>
                ))}
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-[rgba(14,28,66,0.07)] pt-4">
                <Button asChild className="rounded-full">
                  <Link href="/home/book-demo">
                    Talk through your rollout
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
                <Link href="/home/pricing" className="inline-flex items-center text-sm font-medium text-[#1d4ed8] underline-offset-4 hover:underline">
                  Compare pricing paths
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </MarketingSubpageShell>
  );
}
