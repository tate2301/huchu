import Link from "next/link";

import { ArrowRight } from "@/lib/icons";
import type { MarketingSiteConfig } from "@/lib/marketing-site";
import { addOns, pricingTiers } from "@/components/marketing/marketing-data";
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
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl space-y-3">
            <p className={styles.stripeEyebrow}>Pricing</p>
            <h2 className="text-[clamp(2.2rem,4vw,3.8rem)] font-semibold leading-[0.98] tracking-[-0.05em] text-[#0b1945] text-balance">
              Commercial structure that maps directly to product controls.
            </h2>
            <p className="max-w-2xl text-base leading-8 text-[#2d3d66]/80">
              All prices are in USD. Customer-facing bundles carry explicit pricing, while zero-priced packs are internal foundations used to shape templates and entitlements.
            </p>
          </div>
          <Button asChild className="rounded-full">
            <Link href="/home/book-demo">
              Talk through packaging
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>

        <div className="border-y border-[#d6def5]">
          <div className="grid grid-cols-[1.1fr_0.8fr_0.9fr_2fr] gap-4 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#7b88af]">
            <span>Tier</span>
            <span>Base / month</span>
            <span>Included sites</span>
            <span>Commercial story</span>
          </div>
          {pricingTiers.map((tier) => (
            <div key={tier.tier} className="grid grid-cols-[1.1fr_0.8fr_0.9fr_2fr] gap-4 border-t border-[#d6def5] py-4 text-sm leading-7">
              <strong className="text-[#0b1945]">{tier.tier}</strong>
              <span className="font-mono text-[#0b1945]">{tier.price}</span>
              <span className="text-[#30406a]">{tier.sites}</span>
              <span className="text-[#30406a]/82">{tier.summary}</span>
            </div>
          ))}
        </div>

        <div className="mt-4 text-sm leading-6 text-[#61729b]">
          The pricing model also includes a per-site expansion path for each tier, making rollout scope easy to understand before procurement starts.
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[0.72fr_1.28fr]">
          <div>
            <p className={styles.stripeEyebrow}>Add-ons</p>
            <p className="mt-2 text-lg leading-8 text-[#23345f]">
              Expand into advanced accounting, CCTV, compliance, maintenance, branding, portals, and vertical-specific flows as requirements mature.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {addOns.map((item) => (
              <span key={item} className="rounded-full bg-[#e8edff] px-4 py-2 text-sm text-[#2f3f68]">
                {item}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section id="demo" className="mx-auto max-w-7xl px-6 pb-20 lg:px-8 lg:pb-24">
        <div className={styles.ctaWrap}>
          <div className="px-6 pb-6 pt-8 text-white lg:px-10 lg:pb-8 lg:pt-10">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/62">Demo</p>
            <h2 className="mt-3 max-w-3xl text-[clamp(2rem,3.5vw,3.2rem)] font-semibold leading-[1.02] tracking-[-0.04em] text-balance">
              Show us your operating model and we will show the right implementation path.
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
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-white">Huchu</p>
            <p className="max-w-2xl text-sm leading-7">
              One platform for operations, finance, control, and reporting across mines, schools, shops, dealerships, and multi-site businesses.
            </p>
          </div>
          <div className="flex flex-col gap-4 text-sm sm:flex-row sm:flex-wrap sm:items-center sm:gap-6">
            <Link href="/home" className="hover:text-white">
              Home
            </Link>
            <a href="#product" className="hover:text-white">
              Product
            </a>
            <a href="#solutions" className="hover:text-white">
              Solutions
            </a>
            <a href="#pricing" className="hover:text-white">
              Pricing
            </a>
            <a href="#demo" className="hover:text-white">
              Demo
            </a>
            <Link href="/login" className="hover:text-white">
              Sign in
            </Link>
          </div>
        </div>
      </footer>
    </>
  );
}
