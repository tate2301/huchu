import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "@/lib/icons";
import { PLATFORM_BRAND_NAME } from "@/lib/platform/brand";
import { MarketingSubpageShell } from "@/components/marketing/marketing-subpage-shell";
import { Reveal } from "@/components/marketing/motion";
import { Button } from "@/components/ui/button";
import styles from "@/components/marketing/marketing-site.module.css";

export const metadata: Metadata = {
  title: "Pricing",
  description: `Simple pricing for Zimbabwe businesses. ${PLATFORM_BRAND_NAME} starts at $39/month. 14-day free trial.`,
};

const plans = [
  {
    tier: "Starter",
    price: "$39",
    context: "Less than $1.30 per day",
    sites: "1",
    users: "2",
    modules: "1",
    support: "WhatsApp",
    popular: false,
  },
  {
    tier: "Growth",
    price: "$99",
    context: "$3.30 per day — most popular",
    sites: "3",
    users: "10",
    modules: "3",
    support: "Email + WhatsApp",
    popular: true,
  },
  {
    tier: "Business",
    price: "$199",
    context: "$6.60 per day",
    sites: "8",
    users: "25",
    modules: "All",
    support: "Phone + WhatsApp",
    popular: false,
  },
];

const addOns = [
  { name: "Extra User Pack", price: "$19/mo", desc: "5 additional users" },
  { name: "Extra Site", price: "$25/mo", desc: "1 additional location" },
  { name: "White-label & Custom Domain", price: "$39/mo", desc: "Your logo, colors, domain" },
];

const faqs = [
  { q: "Is there a contract?", a: "No. Monthly billing. Cancel anytime. No cancellation fees." },
  { q: "What happens after the free trial?", a: "You pick a plan and enter your payment details. If you don't subscribe, your data stays available for 30 days, then is deleted." },
  { q: "Can I change plans later?", a: "Yes. Upgrade or downgrade anytime. Changes take effect on your next billing date." },
  { q: "What if the internet goes down?", a: "Corelith works offline. Your data is stored on your device and syncs when the internet returns. Built for Zimbabwe." },
  { q: "Do I need a computer?", a: "No. Corelith works on any phone, tablet, or computer. It's a web app — no installation needed." },
  { q: "Can I get a refund?", a: "If you're unhappy in your first month, contact us for a full refund. No questions asked." },
];

export default function PricingPage() {
  return (
    <MarketingSubpageShell
      title="Simple pricing. No surprises."
      description="Pick a plan. Start tracking today. Upgrade or downgrade anytime."
    >
      <section>
        <Reveal>
          <div className="grid gap-5 md:grid-cols-3">
            {plans.map((plan) => (
              <div
                key={plan.tier}
                className={`relative flex flex-col rounded-3xl border p-7 ${
                  plan.popular
                    ? "border-[#0f1f55] bg-[#0f1f55] text-white"
                    : "border-[#d6def5] bg-white"
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#ff6b35] px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
                    Most Popular
                  </div>
                )}
                <p className={`text-sm font-semibold uppercase tracking-wider ${plan.popular ? "text-white/70" : "text-[#7383a9]"}`}>
                  {plan.tier}
                </p>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className={`text-4xl font-bold ${plan.popular ? "text-white" : "text-[#0b1945]"}`}>
                    {plan.price}
                  </span>
                  <span className={`text-sm ${plan.popular ? "text-white/70" : "text-[#7383a9]"}`}>
                    /month
                  </span>
                </div>
                <p className={`mt-1 text-sm ${plan.popular ? "text-white/70" : "text-[#7383a9]"}`}>
                  {plan.context}
                </p>
                <div className={`my-5 h-px ${plan.popular ? "bg-white/10" : "bg-[#d6def5]"}`} />
                <ul className="space-y-2.5 text-sm">
                  <li className="flex items-start gap-2">
                    <svg className={`mt-0.5 size-4 shrink-0 ${plan.popular ? "text-green-400" : "text-[#0f1f55]"}`} viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                    </svg>
                    <span className={plan.popular ? "text-white/90" : "text-[#31436f]/80"}>
                      {plan.sites} business location{plan.sites !== "1" ? "s" : ""}
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className={`mt-0.5 size-4 shrink-0 ${plan.popular ? "text-green-400" : "text-[#0f1f55]"}`} viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                    </svg>
                    <span className={plan.popular ? "text-white/90" : "text-[#31436f]/80"}>
                      {plan.users} user{plan.users !== "2" ? "s" : ""}
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className={`mt-0.5 size-4 shrink-0 ${plan.popular ? "text-green-400" : "text-[#0f1f55]"}`} viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                    </svg>
                    <span className={plan.popular ? "text-white/90" : "text-[#31436f]/80"}>
                      {plan.modules} vertical module{plan.modules !== "1" && plan.modules !== "All" ? "s" : ""}
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className={`mt-0.5 size-4 shrink-0 ${plan.popular ? "text-green-400" : "text-[#0f1f55]"}`} viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                    </svg>
                    <span className={plan.popular ? "text-white/90" : "text-[#31436f]/80"}>Core operations included</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className={`mt-0.5 size-4 shrink-0 ${plan.popular ? "text-green-400" : "text-[#0f1f55]"}`} viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                    </svg>
                    <span className={plan.popular ? "text-white/90" : "text-[#31436f]/80"}>Works offline</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className={`mt-0.5 size-4 shrink-0 ${plan.popular ? "text-green-400" : "text-[#0f1f55]"}`} viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                    </svg>
                    <span className={plan.popular ? "text-white/90" : "text-[#31436f]/80"}>Mobile & web access</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className={`mt-0.5 size-4 shrink-0 ${plan.popular ? "text-green-400" : "text-[#0f1f55]"}`} viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                    </svg>
                    <span className={plan.popular ? "text-white/90" : "text-[#31436f]/80"}>{plan.support} support</span>
                  </li>
                  {plan.popular && (
                    <>
                      <li className="flex items-start gap-2">
                        <svg className="mt-0.5 size-4 shrink-0 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                        </svg>
                        <span className="text-white/90">Advanced reports</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <svg className="mt-0.5 size-4 shrink-0 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                        </svg>
                        <span className="text-white/90">Stock alerts</span>
                      </li>
                    </>
                  )}
                  {plan.tier === "Business" && (
                    <>
                      <li className="flex items-start gap-2">
                        <svg className="mt-0.5 size-4 shrink-0 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                        </svg>
                        <span className="text-white/90">Priority support</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <svg className="mt-0.5 size-4 shrink-0 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                        </svg>
                        <span className="text-white/90">Custom branding</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <svg className="mt-0.5 size-4 shrink-0 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                        </svg>
                        <span className="text-white/90">Custom templates</span>
                      </li>
                    </>
                  )}
                </ul>
                <div className="mt-auto pt-6">
                  <Button
                    asChild
                    size="lg"
                    className={`h-11 w-full rounded-full text-sm font-semibold ${
                      plan.popular
                        ? "bg-white text-[#091127] hover:bg-white/90"
                        : "bg-[#0f1f55] text-white hover:bg-[#0f1f55]/90"
                    }`}
                  >
                    <Link href="/home/book-demo">
                      Start Free Trial
                    </Link>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      {/* Add-ons */}
      <section className="mt-16">
        <Reveal>
          <h3 className="text-center text-xl font-semibold text-[#0b1945]">
            Need more? Add what you need.
          </h3>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {addOns.map((addon) => (
              <div
                key={addon.name}
                className="flex items-center justify-between rounded-2xl border border-[#d6def5] bg-white p-5"
              >
                <div>
                  <p className="text-base font-semibold text-[#0f1f55]">{addon.name}</p>
                  <p className="mt-1 text-sm text-[#31436f]/70">{addon.desc}</p>
                </div>
                <span className="text-lg font-bold text-[#0b1945]">{addon.price}</span>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      {/* Comparison Table */}
      <section className="mt-16">
        <Reveal>
          <h3 className="text-xl font-semibold text-[#0b1945]">Compare plans</h3>
          <div className="mt-6 overflow-hidden rounded-2xl border border-[#d6def5] bg-white">
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
                  {[
                    { f: "Included sites", s: "1", g: "3", b: "8" },
                    { f: "Extra site rate", s: "$25/mo", g: "$35/mo", b: "$50/mo" },
                    { f: "Included users", s: "2", g: "10", b: "25" },
                    { f: "Extra user pack", s: "$19/mo", g: "$19/mo", b: "$19/mo" },
                    { f: "Core operations", s: "✓", g: "✓", b: "✓" },
                    { f: "Vertical modules", s: "1", g: "3", b: "All" },
                    { f: "Basic reports", s: "✓", g: "✓", b: "✓" },
                    { f: "Advanced reports", s: "—", g: "✓", b: "✓" },
                    { f: "Stock alerts", s: "—", g: "✓", b: "✓" },
                    { f: "Priority support", s: "—", g: "—", b: "✓" },
                    { f: "Custom branding", s: "—", g: "—", b: "✓" },
                    { f: "Offline mode", s: "✓", g: "✓", b: "✓" },
                  ].map((row, i) => (
                    <tr key={row.f} className={i % 2 === 1 ? "bg-[#f7f9ff]/60" : ""}>
                      <td className="px-5 py-3 text-[#31436f]/80">{row.f}</td>
                      <td className="px-5 py-3 text-center text-[#31436f]/80">{row.s}</td>
                      <td className="px-5 py-3 text-center text-[#31436f]/80">{row.g}</td>
                      <td className="px-5 py-3 text-center text-[#31436f]/80">{row.b}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Reveal>
      </section>

      {/* FAQ */}
      <section className="mt-16 grid gap-10 lg:grid-cols-[0.5fr_1fr]">
        <Reveal>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#7383a9]">Common questions</p>
            <h3 className="mt-3 text-2xl font-semibold text-[#0b1945]">Questions? We've got answers.</h3>
            <p className="mt-2 text-sm text-[#31436f]/70">
              If you don't see your question here, WhatsApp us. We reply within 2 hours.
            </p>
          </div>
        </Reveal>
        <Reveal>
          <div className="grid gap-4">
            {faqs.map((faq) => (
              <div key={faq.q} className="rounded-2xl border border-[#d6def5] bg-white p-5">
                <p className="text-base font-semibold text-[#0f1f55]">{faq.q}</p>
                <p className="mt-2 text-sm leading-6 text-[#31436f]/80">{faq.a}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </section>
    </MarketingSubpageShell>
  );
}
