import Link from "next/link";

import { ArrowRight } from "@/lib/icons";
import type { MarketingSiteConfig } from "@/lib/marketing-site";
import { addOns, demoHighlights, featuredAddOns, pricingTiers, rolloutPaths } from "@/components/marketing/marketing-data";
import { DemoBookingForm } from "@/components/marketing/demo-booking-form";
import { Button } from "@/components/ui/button";
import styles from "@/components/marketing/marketing-site.module.css";

type MarketingCommercialSectionsProps = {
  config: MarketingSiteConfig;
};

export function MarketingCommercialSections({ config }: MarketingCommercialSectionsProps) {
  return (
    <>
      <section id="pricing" className="mx-auto max-w-7xl px-6 pb-18 lg:px-8 lg:pb-24">
        <div className="grid gap-10 lg:grid-cols-[0.84fr_1.16fr] lg:items-start">
          <div className="space-y-5">
            <p className={styles.stripeEyebrow}>Pricing</p>
            <h2 className="max-w-3xl text-[clamp(2.2rem,4vw,4rem)] font-semibold leading-[0.96] tracking-[-0.055em] text-[#0b1945] text-balance">
              Commercial packaging that mirrors the rollout instead of hiding it.
            </h2>
            <p className="max-w-2xl text-base leading-8 text-[#2d3d66]/82">
              All prices are in USD. Customer-facing bundles carry explicit pricing, while the zero-priced packs stay inside the platform as internal
              foundations for templates and entitlements.
            </p>
            <div className={styles.pricingNote}>
              <p>Choose the tier that matches your current footprint, then add operational packs as the rollout expands.</p>
              <p>Every tier already maps to the live commercial catalog, so packaging, entitlement, and implementation scope stay aligned.</p>
            </div>
            <div className="pt-1">
              <Button asChild className="rounded-full">
                <Link href="/home/book-demo">
                  Talk through pricing
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>
          </div>

          <div className={styles.pricingMatrix}>
            <div className={styles.pricingRowHeader}>
              <span>Tier</span>
              <span>Base / month</span>
              <span>Sites</span>
              <span>Best for</span>
              <span>Commercial story</span>
            </div>
            {pricingTiers.map((tier) => (
              <div key={tier.tier} className={styles.pricingRow}>
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7383a9]">{tier.stage}</p>
                  <strong className="block text-[1.6rem] font-semibold tracking-[-0.05em] text-[#0b1945]">{tier.tier}</strong>
                </div>
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7383a9]">Base / month</p>
                  <span className="block font-mono text-[1.5rem] font-semibold tracking-[-0.05em] text-[#0b1945]">{tier.price}</span>
                </div>
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7383a9]">Sites</p>
                  <div className="space-y-1 text-sm leading-7 text-[#33456f]">
                    <p>{tier.sites}</p>
                    <p className="font-mono text-[#55688f]">{tier.extraSite}</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7383a9]">Best for</p>
                  <p className="text-sm leading-7 text-[#33456f]/88">{tier.bestFor}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7383a9]">Commercial story</p>
                  <p className="max-w-xl text-sm leading-7 text-[#33456f]/88">{tier.summary}</p>
                  <p className="max-w-xl text-sm leading-7 text-[#5b6d95]">{tier.detail}</p>
                </div>
              </div>
            ))}
            <p className="border-t border-[#d6def5] px-6 pt-4 text-sm leading-6 text-[#61729b]">
              Additional-site pricing makes rollout scope legible before procurement starts, which is especially useful for branch-heavy or phased deployments.
            </p>
          </div>
        </div>

        <div className="mt-12 grid gap-8 border-t border-[#d6def5] pt-8 lg:grid-cols-[0.72fr_1.28fr]">
          <div className="space-y-4">
            <p className={styles.stripeEyebrow}>How teams usually buy</p>
            <p className="max-w-2xl text-lg leading-8 text-[#23345f]">
              Most teams start with the pack that solves the immediate operating problem, then layer in finance, compliance, portals, and maintenance as rollout confidence grows.
            </p>
          </div>
          <div className={styles.rolloutGrid}>
            {rolloutPaths.map((path) => (
              <article key={path.title} className={styles.rolloutCard}>
                <p className="text-base font-semibold tracking-[-0.03em] text-[#0f1f55]">{path.title}</p>
                <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#7383a9]">Start with</p>
                <p className="mt-2 text-sm leading-7 text-[#31436f]/86">{path.start}</p>
                <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#7383a9]">Expand into</p>
                <p className="mt-2 text-sm leading-7 text-[#31436f]/86">{path.expand}</p>
              </article>
            ))}
          </div>
        </div>

        <div className="mt-12 grid gap-6 border-t border-[#d6def5] pt-8 lg:grid-cols-[0.72fr_1.28fr]">
          <div className="space-y-4">
            <p className={styles.stripeEyebrow}>Frequently paired add-ons</p>
            <p className="max-w-2xl text-lg leading-8 text-[#23345f]">
              Expand into advanced accounting, CCTV, compliance, maintenance, branding, portals, and vertical-specific flows as requirements mature.
            </p>
          </div>
          <div className="space-y-4">
            {featuredAddOns.map((item) => (
              <div key={item.name} className={styles.addonCard}>
                <div>
                  <p className="text-base font-semibold tracking-[-0.03em] text-[#0f1f55]">{item.name}</p>
                  <p className="mt-1 text-sm leading-7 text-[#31436f]/84">{item.note}</p>
                </div>
                <p className="font-mono text-sm text-[#0f1f55]">{item.price}</p>
              </div>
            ))}
            <div className={styles.addonCloud}>
              {addOns.map((item) => (
                <span key={item}>
                  {item}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="demo" className="mx-auto max-w-7xl px-6 pb-20 lg:px-8 lg:pb-24">
        <div className={styles.ctaWrap}>
          <div className="grid gap-8 px-6 py-8 lg:grid-cols-[0.82fr_1.18fr] lg:px-10 lg:py-10">
            <div className="space-y-5 text-white">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/62">Demo</p>
              <h2 className="max-w-3xl text-[clamp(2rem,3.5vw,3.2rem)] font-semibold leading-[1.02] tracking-[-0.04em] text-balance">
                Show us the operating model and Avenra will show the right implementation path.
              </h2>
              <p className="max-w-2xl text-sm leading-7 text-white/74">
                Bring the handoffs, approvals, and sites that matter most. We will shape the session around the workflow and commercial path that actually
                fit your rollout.
              </p>
              <ul className={`${styles.simpleListInverse} mt-6`}>
                {demoHighlights.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-[24px] border border-white/10 bg-white/6 p-4 shadow-[0_24px_72px_rgba(8,15,42,0.24)] backdrop-blur-sm">
              <DemoBookingForm schedulerHref={config.schedulerHref} schedulerExternal={config.schedulerExternal} />
            </div>
          </div>
        </div>
      </section>

      <footer className={styles.footer}>
        <div className="mx-auto grid max-w-7xl gap-8 px-6 py-10 text-white/70 lg:grid-cols-[1.12fr_0.88fr] lg:px-8">
          <div className="space-y-3">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-white">Avenra</p>
            <p className="max-w-2xl text-sm leading-7">
              One platform for operations, finance, control, and reporting across mines, schools, shops, dealerships, and multi-site businesses.
            </p>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm lg:justify-end">
            <Link href="/home" className="hover:text-white">
              Home
            </Link>
            <Link href="/home/product" className="hover:text-white">
              Product
            </Link>
            <Link href="/home/solutions" className="hover:text-white">
              Solutions
            </Link>
            <Link href="/home/pricing" className="hover:text-white">
              Pricing
            </Link>
            <Link href="/home/book-demo" className="hover:text-white">
              Demo
            </Link>
            <Link href="/login" className="hover:text-white">
              Sign in
            </Link>
          </div>
        </div>
      </footer>
    </>
  );
}
