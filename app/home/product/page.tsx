import Link from "next/link";
import type { Metadata } from "next";

import { ArrowRight } from "@/lib/icons";
import { PLATFORM_BRAND_NAME } from "@/lib/platform/brand";
import {
  guardrailCards,
  moduleRegistryItems,
  postingEngineCards,
  productCapabilityCards,
  productModularityCards,
  productOperatingSteps,
  productOutcomeRows,
  productOverviewPills,
  solutionPages,
} from "@/components/marketing/marketing-data";
import { MarketingSubpageShell } from "@/components/marketing/marketing-subpage-shell";
import { Reveal, StaggerChildren, StaggerItem } from "@/components/marketing/motion";
import { Button } from "@/components/ui/button";
import styles from "@/components/marketing/marketing-site.module.css";

export const metadata: Metadata = {
  title: "Product",
  description: `See how ${PLATFORM_BRAND_NAME} combines one shared product base with modular workflows, advanced guardrails, and a posting engine for growing businesses.`,
};

export default function ProductPage() {
  return (
    <MarketingSubpageShell
      eyebrow="Product"
      title="One product that flexes around the way your business runs."
      description={`${PLATFORM_BRAND_NAME} gives growing businesses a shared base for operations, reporting, documents, permissions, and oversight. Then it layers the workflows each business case needs.`}
      pills={productOverviewPills}
      panelTitle="Why business owners buy it"
      panelBody="They want software that can start with one urgent problem, expand with the business, and avoid becoming a pile of disconnected systems."
      panelLinks={[
        { label: "Explore solutions", href: "/home/solutions" },
        { label: "Book a demo", href: "/home/book-demo" },
      ]}
    >
      <section className="grid gap-12 lg:grid-cols-[0.92fr_1.08fr] lg:items-start">
        <div className="space-y-6">
          <Reveal>
            <p className={styles.stripeEyebrow}>What the base product covers</p>
          </Reveal>
          <Reveal delay={0.05}>
            <h2 className="max-w-3xl text-[clamp(2.1rem,4.4vw,4.2rem)] font-semibold leading-[0.95] tracking-[-0.055em] text-[#0b1945] text-balance">
              A shared business backbone for daily work, reporting, and control.
            </h2>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="max-w-2xl text-base leading-8 text-[#2d3d66]/82">
              This is the part your business should not have to keep replacing. It gives teams one place to work, gives
              leaders one clearer picture, and gives the business a foundation it can keep building on.
            </p>
          </Reveal>

          <Reveal delay={0.15}>
            <div className={styles.productStepsCard}>
              {productOperatingSteps.map((step, index) => (
                <div key={step} className="flex gap-4 border-t border-[#d6def5] pt-4 first:border-t-0 first:pt-0">
                  <span className="font-mono text-xs font-semibold tracking-[0.18em] text-[#7080a7]">0{index + 1}</span>
                  <p className="text-[1.02rem] leading-8 text-[#1f2d52]">{step}</p>
                </div>
              ))}
            </div>
          </Reveal>
        </div>

        <StaggerChildren staggerDelay={0.08} className="grid gap-4 md:grid-cols-2">
          {productCapabilityCards.map((card) => (
            <StaggerItem key={card.title}>
              <article
                className={`${styles.productFeatureCard} transition-transform duration-200 hover:-translate-y-1 hover:shadow-[0_24px_56px_rgba(29,39,79,0.1)]`}
              >
                <p className={styles.productFeatureEyebrow}>{card.eyebrow}</p>
                <p className="mt-2 text-[1.12rem] font-semibold leading-[1.3] tracking-[-0.03em] text-[#0f1f55]">{card.title}</p>
                <p className="mt-3 text-sm leading-7 text-[#31436f]/84">{card.copy}</p>
              </article>
            </StaggerItem>
          ))}
        </StaggerChildren>
      </section>

      <section className="mt-20">
        <div className="mb-8 space-y-4">
          <Reveal>
            <p className={styles.stripeEyebrow}>Advanced guardrails</p>
          </Reveal>
          <Reveal delay={0.05}>
            <h3 className="max-w-3xl text-[clamp(1.95rem,3.7vw,3.25rem)] font-semibold leading-[0.98] tracking-[-0.05em] text-[#0b1945] text-balance">
              The controls that keep your data safe and your audits clean.
            </h3>
          </Reveal>
        </div>
        <StaggerChildren staggerDelay={0.08} className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {guardrailCards.map((card) => (
            <StaggerItem key={card.title}>
              <article className={`${styles.bentoCell} transition-transform duration-200 hover:-translate-y-1`}>
                <p className={styles.productFeatureEyebrow}>{card.eyebrow}</p>
                <p className="mt-2 text-[1.05rem] font-semibold leading-[1.3] tracking-[-0.03em] text-[#0f1f55]">{card.title}</p>
                <p className="mt-3 text-sm leading-7 text-[#31436f]/84">{card.copy}</p>
              </article>
            </StaggerItem>
          ))}
        </StaggerChildren>
      </section>

      <section className="mt-20">
        <div className="mb-8 space-y-4">
          <Reveal>
            <p className={styles.stripeEyebrow}>Posting engine</p>
          </Reveal>
          <Reveal delay={0.05}>
            <h3 className="max-w-3xl text-[clamp(1.95rem,3.7vw,3.25rem)] font-semibold leading-[0.98] tracking-[-0.05em] text-[#0b1945] text-balance">
              Every finance-impacting event posts cleanly — no manual reconciliation.
            </h3>
          </Reveal>
        </div>
        <StaggerChildren staggerDelay={0.08} className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {postingEngineCards.map((card) => (
            <StaggerItem key={card.title}>
              <article className={`${styles.bentoCell} transition-transform duration-200 hover:-translate-y-1`}>
                <p className={styles.productFeatureEyebrow}>{card.eyebrow}</p>
                <p className="mt-2 text-[1.05rem] font-semibold leading-[1.3] tracking-[-0.03em] text-[#0f1f55]">{card.title}</p>
                <p className="mt-3 text-sm leading-7 text-[#31436f]/84">{card.copy}</p>
              </article>
            </StaggerItem>
          ))}
        </StaggerChildren>
      </section>

      <section className="mt-18 grid gap-10 lg:grid-cols-[0.78fr_1.22fr] lg:items-start">
        <div className="space-y-4">
          <Reveal>
            <p className={styles.stripeEyebrow}>How modularity works</p>
          </Reveal>
          <Reveal delay={0.05}>
            <h3 className="max-w-xl text-[clamp(1.95rem,3.7vw,3.25rem)] font-semibold leading-[0.98] tracking-[-0.05em] text-[#0b1945] text-balance">
              Keep one product underneath. Change the workflow layer when the business needs it.
            </h3>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="max-w-xl text-base leading-8 text-[#2d3d66]/82">
              Business owners do not want a separate software decision every time another team, branch, or vertical needs
              attention. Corelith is designed to keep the base shared while the operating flow adapts.
            </p>
          </Reveal>
        </div>

        <StaggerChildren staggerDelay={0.1} className="grid gap-4 md:grid-cols-3">
          {productModularityCards.map((card) => (
            <StaggerItem key={card.title}>
              <article
                className={`${styles.productControlCard} transition-transform duration-200 hover:-translate-y-1 hover:shadow-[0_24px_56px_rgba(29,39,79,0.1)]`}
              >
                <p className={styles.productFeatureEyebrow}>{card.eyebrow}</p>
                <p className="mt-2 text-[1.08rem] font-semibold leading-[1.3] tracking-[-0.03em] text-[#0f1f55]">{card.title}</p>
                <p className="mt-3 text-sm leading-7 text-[#31436f]/84">{card.copy}</p>
              </article>
            </StaggerItem>
          ))}
        </StaggerChildren>
      </section>

      <section className="mt-18 grid gap-10 lg:grid-cols-[0.82fr_1.18fr] lg:items-start">
        <div className="space-y-4">
          <Reveal>
            <p className={styles.stripeEyebrow}>What owners feel</p>
          </Reveal>
          <Reveal delay={0.05}>
            <h3 className="max-w-xl text-[clamp(1.95rem,3.5vw,3.15rem)] font-semibold leading-[0.98] tracking-[-0.05em] text-[#0b1945] text-balance">
              Less system sprawl. Better follow-through. A product the business can grow into.
            </h3>
          </Reveal>
        </div>

        <StaggerChildren staggerDelay={0.1} className="grid gap-4">
          {productOutcomeRows.map((row) => (
            <StaggerItem key={row.title}>
              <article className={styles.productProofCard}>
                <p className={styles.productFeatureEyebrow}>{row.title}</p>
                <p className="mt-3 max-w-3xl text-sm leading-7 text-[#2d3d66]/84">{row.copy}</p>
              </article>
            </StaggerItem>
          ))}
        </StaggerChildren>
      </section>

      <section className="mt-20">
        <div className="mb-8 space-y-4">
          <Reveal>
            <p className={styles.stripeEyebrow}>Module registry</p>
          </Reveal>
          <Reveal delay={0.05}>
            <h3 className="max-w-3xl text-[clamp(1.95rem,3.5vw,3.2rem)] font-semibold leading-[0.98] tracking-[-0.05em] text-[#0b1945] text-balance">
              Everything that ships today.
            </h3>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="max-w-2xl text-base leading-8 text-[#2d3d66]/82">
              Each module is live, documented, and backed by the same shared controls underneath.
            </p>
          </Reveal>
        </div>
        <StaggerChildren staggerDelay={0.05} className={styles.moduleRegistryGrid}>
          {moduleRegistryItems.map((mod) => (
            <StaggerItem key={mod.name}>
              <div className={styles.moduleRegistryCell}>
                <p className="text-sm font-semibold tracking-[-0.02em] text-[#0f1f55]">{mod.name}</p>
                <p className="mt-1 text-sm leading-6 text-[#31436f]/80">{mod.purpose}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {mod.verticals.slice(0, 3).map((v) => (
                    <span key={v} className={styles.productChip}>
                      {v}
                    </span>
                  ))}
                </div>
              </div>
            </StaggerItem>
          ))}
        </StaggerChildren>
      </section>

      <section className="mt-18 grid gap-10 lg:grid-cols-[0.78fr_1.22fr] lg:items-start">
        <div className="space-y-4">
          <Reveal>
            <p className={styles.stripeEyebrow}>Built for multiple business cases</p>
          </Reveal>
          <Reveal delay={0.05}>
            <h3 className="max-w-xl text-[clamp(1.95rem,3.5vw,3.2rem)] font-semibold leading-[0.98] tracking-[-0.05em] text-[#0b1945] text-balance">
              The product stays shared. The solution changes to fit the job.
            </h3>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="max-w-xl text-base leading-8 text-[#2d3d66]/82">
              If the business runs in more than one operating reality, you should still be able to sell, deploy, and grow
              from one product base.
            </p>
          </Reveal>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {solutionPages.slice(0, 6).map((solution) => {
            const Icon = solution.icon;

            return (
              <Link
                key={solution.slug}
                href={`/home/solutions/${solution.slug}`}
                className={`${styles.verticalCard} group transition-transform duration-200 hover:-translate-y-1 hover:shadow-[0_24px_56px_rgba(29,39,79,0.1)]`}
              >
                <div className="flex size-11 items-center justify-center rounded-full bg-[#0f1f55] text-white">
                  <Icon className="size-5" />
                </div>
                <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7383a9]">{solution.eyebrow}</p>
                <p className="mt-2 text-[1.08rem] font-semibold leading-[1.28] tracking-[-0.03em] text-[#0f1f55]">{solution.headline}</p>
                <p className="mt-3 text-sm leading-7 text-[#31436f]/82">{solution.summary}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {solution.modules.slice(0, 3).map((module) => (
                    <span key={module} className={styles.productChip}>
                      {module}
                    </span>
                  ))}
                </div>
                <span className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-[#0f1f55]">
                  View solution
                  <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-1" />
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      <section className={`mt-18 ${styles.ctaWrap} px-6 py-10 text-white lg:px-10`}>
        <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
          <div className="space-y-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/62">Next step</p>
            <h3 className="max-w-2xl text-[clamp(2rem,3.8vw,3.35rem)] font-semibold leading-[1.02] tracking-[-0.045em] text-balance">
              Book a walkthrough of the product base and the solution layer that fits your business.
            </h3>
            <p className="max-w-2xl text-sm leading-7 text-white/74">
              We will show you what stays shared, what changes by business case, and what rollout could look like for
              your team.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <Button asChild size="lg" className="rounded-full bg-white text-[#091127] hover:bg-white/92 hover:text-[#091127]">
              <Link href="/home/book-demo">
                Book a demo
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="rounded-full border-white/18 bg-transparent text-white hover:bg-white/10 hover:text-white"
            >
              <Link href="/home/solutions">Explore solutions</Link>
            </Button>
          </div>
        </div>
      </section>
    </MarketingSubpageShell>
  );
}
