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
      description="Each solution keeps the same platform foundation while the workflow changes."
    >
      <section className="grid gap-10 lg:grid-cols-[1.02fr_0.98fr] lg:items-start">
        <div className="space-y-6">
          <p className={styles.stripeEyebrow}>Solutions</p>
          <h2 className="max-w-3xl text-[clamp(2.1rem,4.4vw,4.15rem)] font-semibold leading-[0.95] tracking-[-0.055em] text-[#0b1945] text-balance">
            One platform, different operating realities.
          </h2>
          <p className="max-w-2xl text-base leading-8 text-[#2d3d66]/82">
            The product stays fixed. The story changes by buyer.
          </p>

          <div className="flex flex-wrap gap-2.5">
            {["Gold", "Schools", "Retail", "Platform admin"].map((item) => (
              <span key={item} className={styles.productPill}>
                {item}
              </span>
            ))}
          </div>
        </div>

        <div className={styles.solutionPreludeCard}>
          <p className={styles.solutionPreludeEyebrow}>Best fit signals</p>
          <div className={styles.solutionSignalGrid}>
            {audienceSignals.map((signal) => (
              <div key={signal} className={styles.solutionSignalCard}>
                <span className={styles.solutionSignalDot} aria-hidden="true" />
                <p className="text-sm leading-7 text-[#2d3d66]/84">{signal}</p>
              </div>
            ))}
          </div>
          <div className="mt-6 rounded-[22px] border border-[#dbe3f6] bg-white/76 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7383a9]">Why it matters</p>
            <p className="mt-2 text-sm leading-7 text-[#31436f]/88">Show how the platform behaves when the operating model changes.</p>
          </div>
        </div>
      </section>

      <section className="mt-16 space-y-16">
        {solutionStories.map((row, index) => (
          <article key={row.eyebrow} className={`${styles.solutionStoryRow} ${index % 2 === 1 ? styles.solutionStoryRowReverse : ""}`}>
            <div className="space-y-5">
              <p className={styles.stripeEyebrow}>{row.eyebrow}</p>
              <h3 className="max-w-2xl text-[clamp(1.95rem,3.7vw,3.3rem)] font-semibold leading-[0.98] tracking-[-0.05em] text-[#0b1945] text-balance">
                {row.title}
              </h3>
              <p className="max-w-2xl text-base leading-8 text-[#2d3d66]/82">{row.copy}</p>
              <p className="max-w-2xl text-sm font-medium leading-7 text-[#0f1f55]">{row.signal}</p>

              <div className="grid gap-3 sm:grid-cols-3">
                {row.points.map((point) => (
                  <div key={point} className={styles.solutionPointCard}>
                    <p className="text-sm leading-7 text-[#2d3d66]/84">{point}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className={styles.solutionWorkflowCard}>
              <div className={styles.solutionWorkflowHead}>
                <span />
                <span />
                <span />
                <p>Live workflow</p>
              </div>
              <div className="space-y-4 p-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  {row.outcomes.map((outcome) => (
                    <div key={outcome} className={styles.solutionOutcomeCard}>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#7383a9]">Outcome</p>
                      <p className="mt-2 text-[1.02rem] font-semibold leading-[1.35] tracking-[-0.03em] text-[#0f1f55]">{outcome}</p>
                    </div>
                  ))}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className={styles.solutionPathCard}>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#7383a9]">Start with</p>
                    <p className="mt-2 text-sm leading-7 text-[#31436f]/84">{row.start}</p>
                  </div>
                  <div className={styles.solutionPathCard}>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#7383a9]">Expand into</p>
                    <p className="mt-2 text-sm leading-7 text-[#31436f]/84">{row.expand}</p>
                  </div>
                </div>
              </div>
            </div>
          </article>
        ))}
      </section>

      <section className="mt-18 grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
        <div className="space-y-4">
          <p className={styles.stripeEyebrow}>Rollout fit</p>
          <h3 className="max-w-xl text-[clamp(1.95rem,3.4vw,3.15rem)] font-semibold leading-[1] tracking-[-0.05em] text-[#0b1945] text-balance">
            Show the next step.
          </h3>
          <p className="max-w-xl text-base leading-8 text-[#2d3d66]/82">
            Good deployment stories show what starts first and what comes next.
          </p>
        </div>

        <div className={styles.solutionFitCard}>
          <div className="grid gap-4 md:grid-cols-2">
            {demoHighlights.map((item, index) => (
              <div key={item} className={styles.solutionFitStep}>
                <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7383a9]">0{index + 1}</p>
                <p className="mt-2 text-sm leading-7 text-[#31436f]/88">{item}</p>
              </div>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap gap-2.5">
            {audienceSignals.map((signal) => (
              <span key={signal} className={styles.productChip}>
                {signal}
              </span>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-[#d6def5] pt-5">
            <Button asChild className="rounded-full">
              <Link href="/home/book-demo">
                Talk through your rollout
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Link href="/home/pricing" className="text-sm font-medium text-[#2d3d66] underline-offset-4 hover:underline">
              Compare pricing paths
            </Link>
          </div>
        </div>
      </section>
    </MarketingSubpageShell>
  );
}
