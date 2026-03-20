import type { Metadata } from "next";
import Link from "next/link";

import { ArrowRight } from "@/lib/icons";
import { MarketingSubpageShell } from "@/components/marketing/marketing-subpage-shell";
import { addOns, pricingTiers } from "@/components/marketing/marketing-data";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Review Avenra pricing tiers and add-on structure for multi-site operators, grounded in the live commercial catalog.",
};

export default function PricingPage() {
  return (
    <MarketingSubpageShell
      title="Pricing that maps to the live commercial catalog."
      description="Customer-facing bundles carry explicit pricing, while foundational internal packs remain non-priced and used for entitlement scaffolding."
    >
      <section className="grid gap-8 lg:grid-cols-[0.86fr_1.14fr]">
        <div className="space-y-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#5e6d93]">Subscription tiers</p>
          <h2 className="text-[clamp(2rem,4vw,3.6rem)] font-semibold leading-[0.98] tracking-[-0.05em] text-[#0b1945] text-balance">
            Simple tier structure with clear site expansion paths.
          </h2>
          <p className="text-base leading-8 text-[#2d3d66]/80">
            Currency is currently modeled in USD. Tiers include site allowances and additional-site pricing that scales with rollout complexity.
          </p>
        </div>

        <div className="space-y-3 border-y border-[#d6def5] py-3">
          <div className="grid grid-cols-[1.1fr_0.8fr_0.9fr_2fr] gap-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#7b88af]">
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
      </section>

      <section className="mt-12 grid gap-6 lg:grid-cols-[0.72fr_1.28fr]">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#5e6d93]">Add-ons</p>
          <p className="mt-3 text-lg leading-8 text-[#23345f]">
            Expand into accounting, compliance, maintenance, CCTV, portals, branding, and vertical-specific advanced workflows.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {addOns.map((item) => (
            <span key={item} className="rounded-full bg-[#e8edff] px-4 py-2 text-sm text-[#2f3f68]">
              {item}
            </span>
          ))}
        </div>
      </section>

      <section className="mt-12 rounded-[26px] bg-[linear-gradient(150deg,#17275d,#0f1b46)] px-6 py-8 text-white lg:px-10">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/62">Commercial walkthrough</p>
        <h3 className="mt-3 max-w-3xl text-[clamp(1.8rem,3.4vw,3rem)] font-semibold leading-[1.04] tracking-[-0.04em] text-balance">
          Need a tier and add-on recommendation for your rollout?
        </h3>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-white/74">
          We can map your sites, workflows, and governance requirements to a phased packaging plan.
        </p>
        <div className="mt-6">
          <Button asChild className="h-11 rounded-full bg-white px-5 text-[#0d1638] hover:bg-white/90 hover:text-[#0d1638]">
            <Link href="/home/book-demo">
              Book a pricing walkthrough
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </section>
    </MarketingSubpageShell>
  );
}
