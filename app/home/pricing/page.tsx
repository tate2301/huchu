import type { Metadata } from "next";
import Link from "next/link";

import { ArrowRight } from "@/lib/icons";
import { MarketingSubpageShell } from "@/components/marketing/marketing-subpage-shell";
import {
  addOns,
  featuredAddOns,
  pricingConfidencePoints,
  pricingSelectionNotes,
  pricingTiers,
  rolloutPaths,
} from "@/components/marketing/marketing-data";
import { Button } from "@/components/ui/button";
import styles from "@/components/marketing/marketing-site.module.css";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Review Avenra pricing tiers and add-on structure for multi-site operators, grounded in the live commercial catalog.",
};

export default function PricingPage() {
  return (
    <MarketingSubpageShell
      title="Pricing shaped around rollout scope."
      description="Bundles carry explicit pricing. Foundational packs and add-ons stay tied to the live catalog."
    >
      <section className={styles.pricingHero}>
        <div className={styles.pricingNarrative}>
          <p className={styles.stripeEyebrow}>Commercial model</p>
          <h2 className="max-w-3xl text-[clamp(2.2rem,4.6vw,4.3rem)] font-semibold leading-[0.96] tracking-[-0.055em] text-[#0b1945] text-balance">
            Simple plans, clear site math, room to expand.
          </h2>
          <p className="max-w-2xl text-base leading-8 text-[#2d3d66]/84">
            Pricing is in USD. Tiers map to rollout shape.
          </p>

          <div className={styles.pricingNoteList}>
            {pricingSelectionNotes.map((item) => (
              <div key={item} className={styles.pricingNoteItem}>
                {item}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[28px] border border-[#d6def5] bg-white px-6 py-6 shadow-[0_18px_48px_rgba(29,39,79,0.08)]">
          <div className={styles.pricingCardTop}>
            <span className={styles.pricingPill}>Commercial facts</span>
            <span className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-[#7282aa]">Live catalog</span>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            {pricingConfidencePoints.map((item) => (
              <div key={item} className="rounded-2xl border border-[#e3e8f6] bg-[#f8faff] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#7282aa]">Included</p>
                <p className="mt-2 text-sm leading-6 text-[#30406a]/86">{item}</p>
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
            <Button asChild variant="outline" className="rounded-full border-[#d6def5] bg-white text-[#0b1945] hover:bg-[#f6f8ff] hover:text-[#0b1945]">
              <Link href="#add-ons">Review add-ons</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="mt-10">
        <div className={styles.pricingCardGrid}>
          {pricingTiers.map((tier, index) => (
            <article key={tier.tier} className={`${styles.pricingCard} ${index === 1 ? styles.pricingCardFeatured : ""}`}>
              <div className={styles.pricingCardTop}>
                <span className={styles.pricingPill}>{tier.stage}</span>
                {index === 1 ? <span className={styles.pricingPill}>Most adopted</span> : null}
              </div>

              <div className={styles.pricingPrice}>
                <strong className="font-mono">{tier.price}</strong>
                <span>/ mo</span>
              </div>

              <div className="space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#7282aa]">Included sites</p>
                <p className="text-base font-medium tracking-[-0.03em] text-[#102252]">{tier.sites}</p>
                <p className="font-mono text-sm text-[#516385]">{tier.extraSite}</p>
              </div>

              <p className="text-sm font-semibold tracking-[-0.02em] text-[#102252]">{tier.bestFor}</p>
              <p className="text-sm leading-7 text-[#30406a]/84">{tier.summary}</p>
              <p className="text-sm leading-7 text-[#30406a]/78">{tier.detail}</p>

              <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-[#e2e8f6] pt-4">
                <Link href="/home/book-demo#demo-form" className="text-sm font-semibold text-[#0b1945] underline-offset-4 hover:underline">
                  Use this tier
                </Link>
                <span className="font-mono text-xs uppercase tracking-[0.16em] text-[#7282aa]">USD pricing</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-14 grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
        <div className="space-y-4">
          <p className={styles.stripeEyebrow}>How teams buy</p>
          <h3 className="text-[clamp(1.9rem,3.7vw,3.15rem)] font-semibold leading-[1] tracking-[-0.05em] text-[#0b1945] text-balance">
            Start with the milestone that matters.
          </h3>
          <p className="max-w-xl text-base leading-8 text-[#2d3d66]/82">
            Most teams start with the smallest pack that solves the problem now.
          </p>
        </div>
        <div className={styles.rolloutGrid}>
          {rolloutPaths.map((path) => (
            <article key={path.title} className={styles.rolloutCard}>
              <p className={styles.productFeatureEyebrow}>{path.title}</p>
              <p className="mt-3 text-sm leading-7 text-[#31436f]/84">{path.start}</p>
              <p className="mt-4 font-medium tracking-[-0.02em] text-[#102252]">{path.expand}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="add-ons" className="mt-14 grid gap-8 lg:grid-cols-[0.74fr_1.26fr]">
        <div className="space-y-4">
          <p className={styles.stripeEyebrow}>Add-ons</p>
          <h3 className="text-[clamp(1.9rem,3.7vw,3.2rem)] font-semibold leading-[1] tracking-[-0.05em] text-[#0b1945] text-balance">
            Layer in what the rollout needs next.
          </h3>
          <p className="max-w-xl text-base leading-8 text-[#2d3d66]/82">
            Start narrow, then add finance, compliance, portals, or depth.
          </p>
        </div>

        <div className={styles.pricingAddonGrid}>
          <div className={styles.pricingAddonList}>
            {featuredAddOns.map((item) => (
              <div key={item.name} className={styles.pricingAddonItem}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-base font-semibold tracking-[-0.03em] text-[#102252]">{item.name}</p>
                    <p className="mt-1 text-sm leading-7 text-[#31436f]/84">{item.note}</p>
                  </div>
                  <p className={styles.pricingAddonPrice}>{item.price}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-[26px] border border-[#d6def5] bg-white p-5">
            <p className={styles.pricingPill}>Featured add-ons</p>
            <div className="mt-4 flex flex-wrap gap-2.5">
              {addOns.map((item) => (
                <span key={item} className={styles.pricingTag}>
                  {item}
                </span>
              ))}
            </div>
            <p className="mt-5 max-w-xl text-sm leading-7 text-[#4c5f86]">
              Shortlist of the bundles most often paired with the tiers above.
            </p>
          </div>
        </div>
      </section>

      <section className={`mt-14 ${styles.pricingClosing} px-6 py-8 text-white lg:px-10`}>
        <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/62">Commercial walkthrough</p>
            <h3 className="mt-3 max-w-3xl text-[clamp(1.9rem,3.6vw,3rem)] font-semibold leading-[1.03] tracking-[-0.045em] text-balance">
              We can map your sites, controls, and add-ons into a phased plan.
            </h3>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-white/74">
              Bring the footprint and workflows. We will turn that into a recommended pack and rollout sequence.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild className="rounded-full bg-white px-5 text-[#0d1638] hover:bg-white/92 hover:text-[#0d1638]">
              <Link href="/home/book-demo#demo-form">
                Book a pricing walkthrough
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="rounded-full border-white/18 bg-white/6 text-white hover:bg-white/12 hover:text-white"
            >
              <Link href="/home/book-demo">Open demo page</Link>
            </Button>
          </div>
        </div>
      </section>
    </MarketingSubpageShell>
  );
}
