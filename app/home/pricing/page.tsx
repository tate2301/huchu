import type { Metadata } from "next";
import Link from "next/link";

import { ArrowRight } from "@/lib/icons";
import { PLATFORM_BRAND_NAME } from "@/lib/platform/brand";
import { PricingCalculator } from "@/components/marketing/pricing-calculator";
import { MarketingSubpageShell } from "@/components/marketing/marketing-subpage-shell";
import { Reveal } from "@/components/marketing/motion";
import { Button } from "@/components/ui/button";
import styles from "@/components/marketing/marketing-site.module.css";

export const metadata: Metadata = {
  title: "Pricing",
  description: `Review ${PLATFORM_BRAND_NAME} pricing tiers and add-on structure for multi-site operators, grounded in the live commercial catalog.`,
};

export default function PricingPage() {
  return (
    <MarketingSubpageShell
      title="Pricing shaped around rollout scope."
      description="Build a live estimate based on your sites, verticals, and add-ons. Enterprise rollouts are priced custom."
    >
      <section>
        <Reveal>
          <div className={styles.pricingEstimator}>
            <div className="mb-6">
              <p className={styles.stripeEyebrow}>Live calculator</p>
              <h2 className="mt-2 max-w-3xl text-[clamp(1.8rem,3.6vw,3rem)] font-semibold leading-[0.98] tracking-[-0.05em] text-[#0b1945] text-balance">
                Pick your sites, verticals, and add-ons. See the estimate update in real time.
              </h2>
            </div>
            <PricingCalculator />
          </div>
        </Reveal>
      </section>

      <section className="mt-16">
        <Reveal>
          <div className={styles.enterpriseBlock}>
            <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
              <div className="space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/62">Enterprise</p>
                <h3 className="max-w-2xl text-[clamp(1.8rem,3.2vw,2.6rem)] font-semibold leading-[1.02] tracking-[-0.04em] text-balance">
                  Need a custom rollout?
                </h3>
                <p className="max-w-2xl text-sm leading-7 text-white/74">
                  Multi-country deployments, white-label requirements, or 50+ sites — we’ll build a custom quote tailored to your governance and scale.
                </p>
              </div>
              <Button asChild size="lg" className="rounded-full bg-white px-6 text-[#091127] hover:bg-white/92 hover:text-[#091127]">
                <Link href="/home/book-demo">
                  Talk to sales
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>
          </div>
        </Reveal>
      </section>
    </MarketingSubpageShell>
  );
}
