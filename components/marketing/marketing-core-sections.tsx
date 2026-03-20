import Link from "next/link";

import { ArrowRight } from "@/lib/icons";
import {
  audienceSignals,
  marketingSiteHighlights,
  proofStats,
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
      <section id="product" className="mx-auto max-w-7xl px-6 pb-18 pt-10 lg:px-8 lg:pb-24">
        <div className="grid gap-12 lg:grid-cols-[0.94fr_1.06fr] lg:items-start">
          <div className="space-y-6">
            <p className={styles.stripeEyebrow}>Product</p>
            <h2 className="max-w-3xl text-[clamp(2.2rem,4.6vw,4.6rem)] font-semibold leading-[0.94] tracking-[-0.055em] text-[#0b1945] text-balance">
              One control plane for teams that need order without ripping out what already works.
            </h2>
            <p className="max-w-2xl text-base leading-8 text-[#2d3d66]/82">
              Avenra keeps workflows, finance, reporting, and admin under one roof so rollout can start with one pack and grow without a platform reset.
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
              <p className={styles.productMatrixEyebrow}>How it fits together</p>
              <p className={styles.productMatrixTitle}>The experience reads like one product, not a bundle of unrelated modules.</p>
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

      <section id="solutions" className="mx-auto max-w-7xl px-6 pb-18 lg:px-8 lg:pb-24">
        <div className="grid gap-10 lg:grid-cols-[0.76fr_1.24fr] lg:items-end">
          <div className="space-y-4">
            <p className={styles.stripeEyebrow}>Sector snapshots</p>
            <h2 className="text-[clamp(2.1rem,4.4vw,4.1rem)] font-semibold leading-[0.96] tracking-[-0.055em] text-[#0b1945] text-balance">
              The product feels premium because the same patterns show up in every surface.
            </h2>
            <p className="max-w-2xl text-base leading-8 text-[#2d3d66]/82">
              Marketing, product, and admin all share the same operating vocabulary. That makes the platform easier to explain to buyers and easier to run once
              it is live.
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

      <section className="mx-auto max-w-7xl px-6 pb-18 lg:px-8 lg:pb-24">
        <div className="grid gap-10 lg:grid-cols-[0.84fr_1.16fr] lg:items-start">
          <div className="space-y-4">
            <p className={styles.stripeEyebrow}>Control pillars</p>
            <h3 className="max-w-xl text-[clamp(1.95rem,3.8vw,3.35rem)] font-semibold leading-[0.98] tracking-[-0.05em] text-[#0b1945] text-balance">
              Four reasons the product does not collapse under growth.
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

      <section className="mx-auto max-w-7xl px-6 pb-16 lg:px-8 lg:pb-20">
        <div className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
          <div className="space-y-4">
            <p className={styles.stripeEyebrow}>Live proof</p>
            <h3 className="max-w-2xl text-[clamp(1.95rem,3.5vw,3.2rem)] font-semibold leading-[1] tracking-[-0.05em] text-[#0b1945] text-balance">
              Claims grounded in shipped platform capability.
            </h3>
            <p className="max-w-2xl text-base leading-8 text-[#2d3d66]/82">
              The commercial story stays honest. These claims are constrained to the product, admin, and workflow surface that already exists in the platform.
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
                  See the platform in context
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Link href="/home/pricing" className="text-sm font-medium text-[#2d3d66] underline-offset-4 hover:underline">
                Review commercial packaging
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-18 lg:px-8 lg:pb-24">
        <div className="grid gap-8 lg:grid-cols-[0.76fr_1.24fr] lg:items-end">
          <div className="space-y-4">
            <p className={styles.stripeEyebrow}>Best fit</p>
            <h3 className="text-[clamp(1.9rem,3.4vw,3rem)] font-semibold leading-[1] tracking-[-0.05em] text-[#0b1945] text-balance">
              Built for operators who need one system across more than one site, team, or workflow.
            </h3>
          </div>
          <div className="space-y-5">
            <p className="max-w-3xl text-base leading-8 text-[#2d3d66]/82">
              Avenra is a strong fit for organizations that keep tripping over spreadsheets, siloed tools, and handoffs between the field and finance.
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
