import Link from "next/link";

import { ArrowRight } from "@/lib/icons";
import type { MarketingSiteConfig } from "@/lib/marketing-site";
import { addOns, featuredAddOns, pricingTiers, rolloutPaths } from "@/components/marketing/marketing-data";
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
        <div className="grid gap-10 lg:grid-cols-[0.76fr_1.24fr] lg:items-start">
          <div className="max-w-2xl space-y-4">
            <p className={styles.stripeEyebrow}>Pricing</p>
            <h2 className="text-[clamp(2.2rem,4vw,3.8rem)] font-semibold leading-[0.98] tracking-[-0.05em] text-[#0b1945] text-balance">
              Commercial packaging that reads like a rollout plan, not a feature maze.
            </h2>
            <p className="max-w-2xl text-base leading-8 text-[#2d3d66]/80">
              All prices are in USD. Avenra&apos;s customer-facing bundles carry explicit pricing, while zero-priced packs remain internal foundations used to shape templates and entitlements.
            </p>
            <div className="space-y-4 border-t border-[#d6def5] pt-5 text-sm leading-7 text-[#4b5d86]">
              <p>Choose the tier that matches your current footprint, then add operational packs as your rollout expands.</p>
              <p>Every tier already maps to the live commercial catalog, so packaging, entitlements, and implementation scope stay aligned.</p>
            </div>
            <div className="pt-2">
              <Button asChild className="rounded-full">
                <Link href="/home/book-demo">
                  Talk through packaging
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>
          </div>

          <div className="border-t border-[#d6def5]">
            {pricingTiers.map((tier) => (
              <div key={tier.tier} className="grid gap-4 border-b border-[#d6def5] py-6 lg:grid-cols-[0.8fr_0.72fr_0.78fr_1.7fr] lg:items-start">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7383a9]">{tier.stage}</p>
                  <strong className="mt-2 block text-[1.6rem] font-semibold tracking-[-0.05em] text-[#0b1945]">{tier.tier}</strong>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7383a9]">Base / month</p>
                  <span className="mt-2 block font-mono text-[1.5rem] font-semibold tracking-[-0.05em] text-[#0b1945]">
                    {tier.price}
                  </span>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7383a9]">Rollout shape</p>
                  <div className="mt-2 space-y-1 text-sm leading-7 text-[#33456f]">
                    <p>{tier.sites}</p>
                    <p className="font-mono text-[#55688f]">{tier.extraSite}</p>
                  </div>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7383a9]">Commercial story</p>
                  <p className="mt-2 max-w-xl text-sm leading-7 text-[#33456f]/88">{tier.summary}</p>
                  <p className="mt-2 max-w-xl text-sm leading-7 text-[#5b6d95]">{tier.detail}</p>
                </div>
              </div>
            ))}
            <p className="pt-4 text-sm leading-6 text-[#61729b]">
              Additional-site pricing makes rollout scope legible before procurement starts, which is especially useful for branch-heavy or phased deployments.
            </p>
          </div>
        </div>

        <div className="mt-10 grid gap-8 border-t border-[#d6def5] pt-8 lg:grid-cols-[0.68fr_1.32fr]">
          <div>
            <p className={styles.stripeEyebrow}>How teams usually buy</p>
            <p className="mt-2 text-lg leading-8 text-[#23345f]">
              Most teams start with the pack that solves the immediate operating problem, then layer in finance, compliance, portals, and maintenance as rollout confidence grows.
            </p>
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            {rolloutPaths.map((path) => (
              <div key={path.title} className="border-t border-[#d6def5] pt-4">
                <p className="text-base font-semibold tracking-[-0.03em] text-[#0f1f55]">{path.title}</p>
                <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#7383a9]">Start with</p>
                <p className="mt-2 text-sm leading-7 text-[#31436f]/86">{path.start}</p>
                <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#7383a9]">Expand into</p>
                <p className="mt-2 text-sm leading-7 text-[#31436f]/86">{path.expand}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-10 grid gap-6 border-t border-[#d6def5] pt-8 lg:grid-cols-[0.72fr_1.28fr]">
          <div>
            <p className={styles.stripeEyebrow}>Frequently paired add-ons</p>
            <p className="mt-2 text-lg leading-8 text-[#23345f]">
              Expand into advanced accounting, CCTV, compliance, maintenance, branding, portals, and vertical-specific flows as requirements mature.
            </p>
          </div>
          <div className="space-y-4">
            {featuredAddOns.map((item) => (
              <div key={item.name} className="grid gap-2 border-t border-[#d6def5] pt-4 md:grid-cols-[1fr_auto] md:items-start">
                <div>
                  <p className="text-base font-semibold tracking-[-0.03em] text-[#0f1f55]">{item.name}</p>
                  <p className="mt-1 text-sm leading-7 text-[#31436f]/84">{item.note}</p>
                </div>
                <p className="font-mono text-sm text-[#0f1f55]">{item.price}</p>
              </div>
            ))}
            <div className="flex flex-wrap gap-2.5 pt-2">
              {addOns.map((item) => (
                <span key={item} className="rounded-full border border-[#d9e1f5] bg-white/70 px-4 py-2 text-sm text-[#2f3f68]">
                  {item}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="demo" className="mx-auto max-w-7xl px-6 pb-20 lg:px-8 lg:pb-24">
        <div className={styles.ctaWrap}>
          <div className="px-6 pb-6 pt-8 text-white lg:px-10 lg:pb-8 lg:pt-10">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/62">Demo</p>
            <h2 className="mt-3 max-w-3xl text-[clamp(2rem,3.5vw,3.2rem)] font-semibold leading-[1.02] tracking-[-0.04em] text-balance">
              Show us the operating model and Avenra will show the right implementation path.
            </h2>
          </div>
          <div className="px-6 pb-8 lg:px-10 lg:pb-10">
            <DemoBookingForm schedulerHref={config.schedulerHref} schedulerExternal={config.schedulerExternal} />
          </div>
        </div>
      </section>

      <footer className={styles.footer}>
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-10 text-white/70 lg:flex-row lg:items-end lg:justify-between lg:px-8">
          <div className="space-y-3">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-white">Avenra</p>
            <p className="max-w-2xl text-sm leading-7">
              One platform for operations, finance, control, and reporting across mines, schools, shops, dealerships, and multi-site businesses.
            </p>
          </div>
          <div className="flex flex-col gap-4 text-sm sm:flex-row sm:flex-wrap sm:items-center sm:gap-6">
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
