import Link from "next/link";
import type { Metadata } from "next";

import { ArrowRight } from "@/lib/icons";
import {
  proofStats,
  productControlMap,
  productFeatureCards,
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
  description: "Explore the Avenra product model: one shared control plane across vertical packs.",
};

export default function ProductPage() {
  return (
    <MarketingSubpageShell
      title="One shared control plane."
      description="Avenra keeps sector workflows and financial integrity in the same system."
    >
      <section className="grid gap-12 lg:grid-cols-[0.96fr_1.04fr] lg:items-start">
        <div className="space-y-6">
          <p className={styles.stripeEyebrow}>Product</p>
          <h2 className="max-w-3xl text-[clamp(2.1rem,4.4vw,4.25rem)] font-semibold leading-[0.94] tracking-[-0.055em] text-[#0b1945] text-balance">
            Same rails. Different workflows.
          </h2>
          <p className="max-w-2xl text-base leading-8 text-[#2d3d66]/82">
            Identity, tenancy, branding, output, and packaging stay fixed while the workflow changes by sector.
          </p>

          <div className="flex flex-wrap gap-2.5">
            {["Shared rails", "Pack-by-pack rollout", "Commercially aligned"].map((item) => (
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
            <p className={styles.productMatrixTitle}>One product. Fewer moving parts.</p>
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
      </section>

      <section className="mt-14">
        <div className={styles.statBand}>
          {proofStats.map((entry) => (
            <div key={entry.label} className={styles.statCell}>
              <strong>{entry.value}</strong>
              <span>{entry.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-18 grid gap-10 lg:grid-cols-[0.82fr_1.18fr] lg:items-start">
        <div className="space-y-4">
          <p className={styles.stripeEyebrow}>What ships together</p>
          <h3 className="max-w-xl text-[clamp(1.9rem,3.6vw,3.25rem)] font-semibold leading-[1] tracking-[-0.05em] text-[#0b1945] text-balance">
            The same patterns show up in every surface.
          </h3>
          <p className="max-w-xl text-base leading-8 text-[#2d3d66]/82">
            Marketing, product, and admin share one operating vocabulary.
          </p>
        </div>
        <div className={styles.productControlGrid}>
          {productControlMap.map((item) => (
            <article key={item.title} className={styles.productControlCard}>
              <p className={styles.productFeatureEyebrow}>{item.title}</p>
              <p className="mt-2 text-sm leading-7 text-[#31436f]/84">{item.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-18 grid gap-10 xl:grid-cols-[0.72fr_1.28fr] xl:items-start">
        <div className="space-y-4">
          <p className={styles.stripeEyebrow}>Sector proof</p>
          <h3 className="max-w-xl text-[clamp(1.9rem,3.6vw,3.25rem)] font-semibold leading-[1] tracking-[-0.05em] text-[#0b1945] text-balance">
            The same story reads differently by customer.
          </h3>
          <p className="max-w-xl text-base leading-8 text-[#2d3d66]/82">
            Buyers want a clear answer to the operating problem in front of them.
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
      </section>

      <section className="mt-18 grid gap-10 lg:grid-cols-[0.82fr_1.18fr] lg:items-start">
        <div className="space-y-4">
          <p className={styles.stripeEyebrow}>Control pillars</p>
          <h3 className="text-[clamp(1.9rem,3.5vw,3.15rem)] font-semibold leading-[1] tracking-[-0.05em] text-[#0b1945] text-balance">
            Four reasons the product stays coherent as the org grows.
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
      </section>

      <section className="mt-18 grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
        <div className="space-y-4">
          <p className={styles.stripeEyebrow}>Live proof</p>
          <h3 className="max-w-2xl text-[clamp(1.95rem,3.5vw,3.2rem)] font-semibold leading-[1] tracking-[-0.05em] text-[#0b1945] text-balance">
            Claims grounded in shipped capability.
          </h3>
          <p className="max-w-2xl text-base leading-8 text-[#2d3d66]/82">The story stays honest. These claims are in production now.</p>
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
                See it live
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Link href="/home/pricing" className="text-sm font-medium text-[#2d3d66] underline-offset-4 hover:underline">
              Review pricing
            </Link>
          </div>
        </div>
      </section>

      <section className="mt-18 grid gap-8 lg:grid-cols-[0.76fr_1.24fr] lg:items-end">
        <div className="space-y-4">
          <p className={styles.stripeEyebrow}>Best fit</p>
          <h3 className="text-[clamp(1.9rem,3.4vw,3rem)] font-semibold leading-[1] tracking-[-0.05em] text-[#0b1945] text-balance">
            Built for operators with more than one site, team, or workflow.
          </h3>
        </div>
        <div className="space-y-5">
          <p className="max-w-3xl text-base leading-8 text-[#2d3d66]/82">Avenra fits teams that are outgrowing spreadsheets and siloed tools.</p>
          <div className="flex flex-wrap gap-2.5">
            {["Multiple sites", "Operational handoffs", "Cash or stock control", "Audit pressure", "Pack-by-pack rollout"].map((signal) => (
              <span key={signal} className={styles.productChip}>
                {signal}
              </span>
            ))}
          </div>
        </div>
      </section>
    </MarketingSubpageShell>
  );
}
