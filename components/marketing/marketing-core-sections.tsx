import Link from "next/link";

import { ArrowRight } from "@/lib/icons";
import { PLATFORM_BRAND_NAME } from "@/lib/platform/brand";
import {
  audienceSignals,
  marketingSiteHighlights,
  proofStats,
  productControlMap,
  productFeatureCards,
  showcaseCards,
  trustClaims,
  valuePillars,
  productSteps,
} from "@/components/marketing/marketing-data";
import { Button } from "@/components/ui/button";
import styles from "@/components/marketing/marketing-site.module.css";

export function MarketingCoreSections() {
  return (
    <>
      <section id="product" className="mx-auto max-w-7xl px-6 pb-20 pt-10 lg:px-8 lg:pb-28">
        <div className="grid gap-12 lg:grid-cols-[0.96fr_1.04fr] lg:items-start">
          <div className="space-y-6">
            <p className={styles.stripeEyebrow}>How it works</p>
            <h2 className="max-w-3xl text-[clamp(2.2rem,4.6vw,4.6rem)] font-semibold leading-[0.94] tracking-[-0.055em] text-[#0b1945] text-balance">
              Bring the work into one place, then grow from there.
            </h2>
            <p className="max-w-2xl text-base leading-8 text-[#2d3d66]/82">
              You do not need a huge all-at-once rollout. Most teams start with the part of the business causing the most
              friction, then expand once the process is working.
            </p>

            <div className="flex flex-wrap gap-2.5">
              {marketingSiteHighlights.map((item) => (
                <span key={item} className={styles.productPill}>
                  {item}
                </span>
              ))}
            </div>

            <div className={styles.productStepsCard}>
              {productSteps.map((item, index) => (
                <div key={item} className="flex gap-4 border-t border-[#d6def5] pt-4 first:border-t-0 first:pt-0">
                  <span className="font-mono text-xs font-semibold tracking-[0.18em] text-[#7080a7]">0{index + 1}</span>
                  <p className="text-[1.02rem] leading-8 text-[#1f2d52]">{item}</p>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.productMatrix}>
            <div className={styles.productMatrixHead}>
              <p className={styles.productMatrixEyebrow}>What you get</p>
              <p className={styles.productMatrixTitle}>A setup that is easier to use today and easier to expand later.</p>
            </div>
            <div className="grid gap-4 p-5">
              {productFeatureCards.map((card) => (
                <div key={card.eyebrow} className={styles.productFeatureCard}>
                  <p className={styles.productFeatureEyebrow}>{card.eyebrow}</p>
                  <p className="mt-2 text-[1.15rem] font-semibold leading-[1.25] tracking-[-0.03em] text-[#0f1f55]">{card.title}</p>
                  <p className="mt-3 text-sm leading-7 text-[#31436f]/84">{card.copy}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-10">
          <div className="mb-4 max-w-2xl space-y-3">
            <p className={styles.stripeEyebrow}>Why teams move</p>
            <h3 className="text-[clamp(1.8rem,3.4vw,3rem)] font-semibold leading-[1] tracking-[-0.05em] text-[#0b1945] text-balance">
              Less chasing. Fewer blind spots. Better follow-through.
            </h3>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            {productControlMap.map((item) => (
              <article key={item.title} className={styles.productControlCard}>
                <p className={styles.productFeatureEyebrow}>{item.title}</p>
                <p className="mt-3 text-sm leading-7 text-[#31436f]/84">{item.copy}</p>
              </article>
            ))}
          </div>
        </div>

        <div className="mt-14">
          <div className={styles.statBand}>
            {proofStats.map((entry) => (
              <div key={entry.label} className={styles.statCell}>
                <strong>{entry.value}</strong>
                <span>{entry.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="solutions" className="mx-auto max-w-7xl px-6 pb-20 lg:px-8 lg:pb-28">
        <div className="grid gap-10 lg:grid-cols-[0.76fr_1.24fr] lg:items-end">
          <div className="space-y-4">
            <p className={styles.stripeEyebrow}>Sector proof</p>
            <h2 className="text-[clamp(2.1rem,4.4vw,4.1rem)] font-semibold leading-[0.96] tracking-[-0.055em] text-[#0b1945] text-balance">
              Different industries. The same need for clearer control.
            </h2>
            <p className="max-w-2xl text-base leading-8 text-[#2d3d66]/82">
              Corelith is broad enough for growing SMBs, with enough operational depth to fit teams that handle stock,
              finance, approvals, sensitive records, or multi-site activity.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {showcaseCards.map((card, index) => (
              <article key={card.eyebrow} className={`${styles.productShowcaseCard} ${index === 2 ? styles.productShowcaseCardWide : ""}`}>
                <p className={styles.productFeatureEyebrow}>{card.eyebrow}</p>
                <p className="mt-2 text-[1.15rem] font-semibold leading-[1.22] tracking-[-0.035em] text-[#0f1f55]">{card.title}</p>
                <p className="mt-3 text-sm leading-7 text-[#31436f]/84">{card.copy}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {card.chips.map((chip) => (
                    <span key={chip} className={styles.productChip}>
                      {chip}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-20 lg:px-8 lg:pb-28">
        <div className="grid gap-10 lg:grid-cols-[0.84fr_1.16fr] lg:items-start">
          <div className="space-y-4">
            <p className={styles.stripeEyebrow}>What improves</p>
            <h3 className="max-w-xl text-[clamp(1.95rem,3.8vw,3.35rem)] font-semibold leading-[0.98] tracking-[-0.05em] text-[#0b1945] text-balance">
              Four reasons owners and managers get more confidence once the work is connected.
            </h3>
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            {valuePillars.map((pillar) => {
              const Icon = pillar.icon;
              return (
                <div key={pillar.title} className={styles.productValueCard}>
                  <div className="flex size-11 items-center justify-center rounded-full bg-[#0f1f55] text-white">
                    <Icon className="size-5" />
                  </div>
                  <p className="mt-4 text-xl font-semibold tracking-[-0.03em] text-[#0f1f55]">{pillar.title}</p>
                  <p className="mt-3 text-sm leading-7 text-[#2d3d66]/80">{pillar.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-18 lg:px-8 lg:pb-24">
        <div className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
          <div className="space-y-4">
            <p className={styles.stripeEyebrow}>Why buyers trust it</p>
            <h3 className="max-w-2xl text-[clamp(1.95rem,3.5vw,3.2rem)] font-semibold leading-[1] tracking-[-0.05em] text-[#0b1945] text-balance">
              The story matches what the product can already do.
            </h3>
            <p className="max-w-2xl text-base leading-8 text-[#2d3d66]/82">
              This is not a future-state pitch. The homepage reflects live workflows, live plans, and live rollout options.
            </p>
          </div>
          <div className={styles.productProofCard}>
            <div className="grid gap-3">
              {trustClaims.map((claim) => (
                <p key={claim} className="border-t border-[#d6def5] pt-3 text-sm leading-7 text-[#2d3d66]/82 first:border-t-0 first:pt-0">
                  {claim}
                </p>
              ))}
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-[#d6def5] pt-5">
              <Button asChild className="rounded-full">
                <Link href="/home/book-demo">
                  Book a demo
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Link href="/home/pricing" className="text-sm font-medium text-[#2d3d66] underline-offset-4 hover:underline">
                See pricing
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-20 lg:px-8 lg:pb-28">
        <div className="grid gap-8 lg:grid-cols-[0.76fr_1.24fr] lg:items-end">
          <div className="space-y-4">
            <p className={styles.stripeEyebrow}>Best fit</p>
            <h3 className="text-[clamp(1.9rem,3.4vw,3rem)] font-semibold leading-[1] tracking-[-0.05em] text-[#0b1945] text-balance">
              Best for teams that have outgrown basic tools but are not looking for enterprise bloat.
            </h3>
          </div>
          <div className="space-y-5">
            <p className="max-w-3xl text-base leading-8 text-[#2d3d66]/82">
              {PLATFORM_BRAND_NAME} fits growing businesses that need more structure, better visibility, and cleaner
              day-to-day follow-through across locations and teams.
            </p>
            <div className="flex flex-wrap gap-2.5">
              {audienceSignals.map((signal) => (
                <span key={signal} className={styles.productChip}>
                  {signal}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
