/**
 * NEW PRICING PAGE
 * Drop this into: /tmp/huchu/app/home/pricing/page.tsx
 * 
 * This replaces the complex pricing calculator with a simple 3-tier
 * pricing page designed for Zimbabwe SMBs.
 */

import Link from "next/link";
import type { Metadata } from "next";

import { ArrowRight, Check, Zap, Shield, Building } from "@/lib/icons";
import { PLATFORM_BRAND_NAME } from "@/lib/platform/brand";
import { pricingTiers, tierComparisonRows } from "@/components/marketing/marketing-data";
import { MarketingSubpageShell } from "@/components/marketing/marketing-subpage-shell";
import { Reveal, StaggerChildren, StaggerItem } from "@/components/marketing/motion";
import { Button } from "@/components/ui/button";
import styles from "@/components/marketing/marketing-site.module.css";

export const metadata: Metadata = {
  title: "Pricing",
  description: `Simple pricing for Zimbabwe businesses. Start at $39/month. 14-day free trial. No credit card required.`,
};

const planIcons = {
  Starter: Building,
  Growth: Zap,
  Business: Shield,
};

const planContexts = {
  Starter: "Less than $1.30 per day",
  Growth: "$3.30 per day — less than one tank of fuel",
  Business: "$6.60 per day — less than one employee's daily wage",
};

export default function PricingPage() {
  return (
    <MarketingSubpageShell
      eyebrow="Pricing"
      title="Simple pricing. No surprises."
      description={`${PLATFORM_BRAND_NAME} is priced so Zimbabwe businesses can start small and grow. No complex calculators. No hidden fees. Just pick a plan and start tracking.`}
      pills={["3 simple tiers", "Start at $39/month", "14-day free trial"]}
      panelTitle="What's included"
      panelBody="Every plan includes core operations, offline mode, mobile access, and role-based views. You pay for sites, users, and modules — not seat warmers."
      panelLinks={[
        { label: "Start free trial", href: "/home/book-demo" },
        { label: "Compare features", href: "#comparison" },
      ]}
    >
      {/* PRICING CARDS */}
      <StaggerChildren staggerDelay={0.12} className="grid gap-5 md:grid-cols-3">
        {pricingTiers.map((plan) => {
          const Icon = planIcons[plan.tier as keyof typeof planIcons];
          const isGrowth = plan.tier === "Growth";

          return (
            <StaggerItem key={plan.tier}>
              <article
                className={`relative flex flex-col rounded-[22px] border transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_24px_56px_rgba(29,39,79,0.1)] ${
                  isGrowth
                    ? "border-[#0f1f55] bg-[#0f1f55] text-white"
                    : "border-[#d6def5] bg-white"
                }`}
              >
                {isGrowth && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#ff6b35] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-white">
                    Most Popular
                  </div>
                )}

                <div className="flex flex-1 flex-col p-6 lg:p-7">
                  <div className="mb-4 flex size-10 items-center justify-center rounded-full bg-[#f0f4ff]">
                    <Icon className={`size-4 ${isGrowth ? "text-[#0f1f55]" : "text-[#0f1f55]"}`} />
                  </div>

                  <p className={`text-sm font-semibold uppercase tracking-[0.12em] ${isGrowth ? "text-white/72" : "text-[#7383a9]"}`}>
                    {plan.tier}
                  </p>

                  <div className="mt-2 flex items-baseline gap-1">
                    <span className={`text-[clamp(2.2rem,3.5vw,2.8rem)] font-bold tracking-[-0.04em] ${isGrowth ? "text-white" : "text-[#0b1945]"}`}>
                      {plan.price}
                    </span>
                    <span className={`text-sm ${isGrowth ? "text-white/72" : "text-[#7383a9]"}`}>/month</span>
                  </div>

                  <p className={`mt-1 text-sm ${isGrowth ? "text-white/72" : "text-[#7383a9]"}`}>
                    {planContexts[plan.tier as keyof typeof planContexts]}
                  </p>

                  <p className={`mt-4 text-sm leading-6 ${isGrowth ? "text-white/82" : "text-[#31436f]/82"}`}>
                    {plan.summary}
                  </p>

                  <div className={`my-5 h-px ${isGrowth ? "bg-white/12" : "bg-[#d6def5]"}`} />

                  <ul className="space-y-2.5">
                    {[
                      plan.sites,
                      plan.tier === "Starter" ? "2 users" : plan.tier === "Growth" ? "10 users" : "25 users",
                      plan.tier === "Starter" ? "1 vertical module" : plan.tier === "Growth" ? "3 vertical modules" : "All modules",
                      "Core operations included",
                      "Offline mode",
                      "Mobile & web access",
                      plan.tier === "Starter" ? "WhatsApp support" : plan.tier === "Growth" ? "Email + WhatsApp support" : "Phone + WhatsApp support",
                      plan.tier === "Business" ? "Priority support" : null,
                      plan.tier === "Business" ? "Custom branding" : null,
                    ].filter(Boolean).map((feature) => (
                      <li key={feature as string} className="flex items-start gap-2 text-sm">
                        <Check className={`mt-0.5 size-4 shrink-0 ${isGrowth ? "text-[#4ade80]" : "text-[#0f1f55]"}`} />
                        <span className={isGrowth ? "text-white/82" : "text-[#31436f]/84"}>{feature as string}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-auto pt-6">
                    <Button
                      asChild
                      size="lg"
                      className={`w-full rounded-full ${
                        isGrowth
                          ? "bg-white text-[#091127] hover:bg-white/92"
                          : "bg-[#0f1f55] text-white hover:bg-[#0f1f55]/90"
                      }`}
                    >
                      <Link href="/home/book-demo">
                        Start Free Trial
                        <ArrowRight className="size-4" />
                      </Link>
                    </Button>
                  </div>
                </div>
              </article>
            </StaggerItem>
          );
        })}
      </StaggerChildren>

      {/* ADD-ONS SECTION */}
      <section className="mt-16">
        <Reveal>
          <div className="text-center">
            <p className={styles.stripeEyebrow}>Need more?</p>
            <h3 className="mt-3 text-[clamp(1.6rem,2.8vw,2.4rem)] font-semibold leading-[1.05] tracking-[-0.04em] text-[#0b1945]">
              Add what you need. Nothing you don't.
            </h3>
          </div>
        </Reveal>

        <StaggerChildren staggerDelay={0.1} className="mt-8 grid gap-4 md:grid-cols-3">
          {[
            { name: "Extra User Pack", price: "$19/mo", desc: "5 additional users" },
            { name: "Extra Site", price: "$25/mo", desc: "1 additional location" },
            { name: "White-label", price: "$39/mo", desc: "Your logo, colors, domain" },
          ].map((addon) => (
            <StaggerItem key={addon.name}>
              <div className="flex items-center justify-between rounded-[16px] border border-[#d6def5] bg-white p-5">
                <div>
                  <p className="text-base font-semibold text-[#0f1f55]">{addon.name}</p>
                  <p className="mt-1 text-sm text-[#31436f]/72">{addon.desc}</p>
                </div>
                <span className="font-mono text-lg font-semibold text-[#0b1945]">{addon.price}</span>
              </div>
            </StaggerItem>
          ))}
        </StaggerChildren>
      </section>

      {/* COMPARISON TABLE */}
      <section id="comparison" className="mt-18">
        <Reveal>
          <p className={styles.stripeEyebrow}>Compare plans</p>
          <h3 className="mt-3 text-[clamp(1.6rem,2.8vw,2.4rem)] font-semibold leading-[1.05] tracking-[-0.04em] text-[#0b1945]">
            What's included in each plan
          </h3>
        </Reveal>

        <Reveal delay={0.1}>
          <div className="mt-8 overflow-hidden rounded-[18px] border border-[#d6def5] bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#d6def5] bg-[#f7f9ff]">
                    <th className="px-5 py-4 text-left font-semibold text-[#0b1945]">Feature</th>
                    <th className="px-5 py-4 text-center font-semibold text-[#0b1945]">Starter</th>
                    <th className="px-5 py-4 text-center font-semibold text-[#0b1945]">Growth</th>
                    <th className="px-5 py-4 text-center font-semibold text-[#0b1945]">Business</th>
                  </tr>
                </thead>
                <tbody>
                  {tierComparisonRows.map((row, i) => (
                    <tr key={row.label} className={i % 2 === 1 ? "bg-[#f7f9ff]/60" : ""}>
                      <td className="px-5 py-3.5 text-[#31436f]/84">{row.label}</td>
                      <td className="px-5 py-3.5 text-center text-[#31436f]/84">{row.basic}</td>
                      <td className="px-5 py-3.5 text-center text-[#31436f]/84">{row.standard}</td>
                      <td className="px-5 py-3.5 text-center text-[#31436f]/84">{row.enterprise}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Reveal>
      </section>

      {/* FAQ SECTION */}
      <section className="mt-18 grid gap-10 lg:grid-cols-[0.7fr_1.3fr]">
        <div className="space-y-4">
          <Reveal>
            <p className={styles.stripeEyebrow}>Common questions</p>
          </Reveal>
          <Reveal delay={0.05}>
            <h3 className="text-[clamp(1.6rem,2.8vw,2.4rem)] font-semibold leading-[1.05] tracking-[-0.04em] text-[#0b1945]">
              Questions? We've got answers.
            </h3>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="text-base leading-7 text-[#2d3d66]/82">
              If you don't see your question here, WhatsApp us. We reply within 2 hours.
            </p>
          </Reveal>
        </div>

        <StaggerChildren staggerDelay={0.08} className="grid gap-4">
          {[
            {
              q: "Is there a contract?",
              a: "No. Monthly billing. Cancel anytime. No cancellation fees.",
            },
            {
              q: "What happens after the free trial?",
              a: "You pick a plan and enter your payment details. If you don't subscribe, your data stays available for 30 days, then is deleted.",
            },
            {
              q: "Can I change plans later?",
              a: "Yes. Upgrade or downgrade anytime. Changes take effect on your next billing date.",
            },
            {
              q: "What if the internet goes down?",
              a: "Corelith works offline. Your data is stored on your device and syncs when the internet returns. We built this for Zimbabwe.",
            },
            {
              q: "Do I need a computer?",
              a: "No. Corelith works on any phone, tablet, or computer. It's a web app — no installation needed.",
            },
            {
              q: "Can I get a refund?",
              a: "If you're unhappy in your first month, contact us for a full refund. No questions asked.",
            },
          ].map((faq) => (
            <StaggerItem key={faq.q}>
              <div className="rounded-[14px] border border-[#d6def5] bg-white p-5">
                <p className="text-base font-semibold text-[#0f1f55]">{faq.q}</p>
                <p className="mt-2 text-sm leading-6 text-[#31436f]/82">{faq.a}</p>
              </div>
            </StaggerItem>
          ))}
        </StaggerChildren>
      </section>

      {/* FINAL CTA */}
      <section className={`mt-18 ${styles.ctaWrap} px-6 py-10 text-white lg:px-10`}>
        <div className="grid gap-8 lg:grid-cols-[0.88fr_1.12fr] lg:items-end">
          <div className="space-y-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/62">Ready to start?</p>
            <h3 className="max-w-2xl text-[clamp(2rem,3.7vw,3.25rem)] font-semibold leading-[1.02] tracking-[-0.045em] text-balance">
              Stop losing money to chaos.
            </h3>
            <p className="max-w-2xl text-sm leading-7 text-white/74">
              Start free for 14 days. No credit card. No contract. If it doesn't save you time and money, cancel with one click.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <Button asChild size="lg" className="rounded-full bg-white text-[#091127] hover:bg-white/92 hover:text-[#091127]">
              <Link href="/home/book-demo">
                Start Free for 14 Days
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="rounded-full border-white/18 bg-transparent text-white hover:bg-white/10 hover:text-white"
            >
              <Link href="/home/solutions">Explore Solutions</Link>
            </Button>
          </div>
        </div>
      </section>
    </MarketingSubpageShell>
  );
}
