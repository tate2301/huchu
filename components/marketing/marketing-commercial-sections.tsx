import Link from "next/link";

import { ArrowRight } from "@/lib/icons";
import type { MarketingSiteConfig } from "@/lib/marketing-site";
import { addOns, pricingTiers } from "@/components/marketing/marketing-data";
import { DemoBookingForm } from "@/components/marketing/demo-booking-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type MarketingCommercialSectionsProps = {
  config: MarketingSiteConfig;
};

export function MarketingCommercialSections({ config }: MarketingCommercialSectionsProps) {
  return (
    <>
      <section id="pricing" className="border-t border-slate-200 bg-[#fbf7ef]">
        <div className="mx-auto max-w-7xl px-6 py-18 lg:px-8 lg:py-24">
          <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
            <div className="space-y-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                Pricing
              </p>
              <h2 className="text-[clamp(2.4rem,4vw,4.2rem)] font-semibold leading-[0.98] tracking-[-0.05em] text-balance text-slate-950">
                Commercial packaging already wired into the product.
              </h2>
              <p className="max-w-xl text-base leading-8 text-slate-600">
                Huchu already models tiers, add-ons, dependencies, and tenant entitlements, so the pricing story maps to live controls rather than a slide-deck abstraction.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {pricingTiers.map((tier, index) => (
                <Card
                  key={tier.tier}
                  className={`rounded-[28px] border-slate-200 shadow-[0_18px_50px_rgba(24,32,48,0.06)] ${
                    index === 1 ? "bg-slate-950 text-white" : "bg-white"
                  }`}
                >
                  <CardHeader className="space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <CardTitle className={index === 1 ? "text-white" : "text-slate-950"}>
                        {tier.tier}
                      </CardTitle>
                      {index === 1 ? (
                        <Badge variant="warning" className="rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.2em]">
                          Best fit
                        </Badge>
                      ) : null}
                    </div>
                    <div>
                      <p className={`font-mono text-[3rem] font-semibold tracking-[-0.06em] ${index === 1 ? "text-white" : "text-slate-950"}`}>
                        {tier.price}
                      </p>
                      <p className={index === 1 ? "text-sm text-white/68" : "text-sm text-slate-500"}>
                        per month
                      </p>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className={`rounded-[20px] border px-4 py-4 ${index === 1 ? "border-white/12 bg-white/6" : "border-slate-200 bg-slate-50"}`}>
                      <p className={index === 1 ? "text-sm font-semibold text-white" : "text-sm font-semibold text-slate-950"}>
                        {tier.sites}
                      </p>
                      <p className={`mt-2 text-sm ${index === 1 ? "text-white/68" : "text-slate-500"}`}>
                        {tier.extraSite}
                      </p>
                    </div>
                    <p className={index === 1 ? "text-sm leading-7 text-white/72" : "text-sm leading-7 text-slate-600"}>
                      {tier.summary}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          <div className="mt-10 rounded-[28px] border border-slate-200 bg-white px-6 py-6 shadow-[0_18px_50px_rgba(24,32,48,0.05)]">
            <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Add-ons
                </p>
                <p className="mt-2 text-xl font-semibold tracking-[-0.03em] text-slate-950">
                  Expand into advanced workflows without replacing the platform.
                </p>
              </div>
              <Button asChild className="rounded-full">
                <Link href="/home/book-demo">
                  Talk through packaging
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {addOns.map((item) => (
                <Badge key={item} variant="outline" className="rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-slate-700">
                  {item}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-slate-200 bg-[#0d1624] text-white">
        <div className="mx-auto max-w-7xl px-6 py-18 lg:px-8 lg:py-24">
          <div className="mb-10 max-w-3xl space-y-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/52">
              Book a demo
            </p>
            <h2 className="text-[clamp(2.4rem,4vw,4.2rem)] font-semibold leading-[0.98] tracking-[-0.05em] text-balance text-white">
              Show us the operating model. We will show you the right system story.
            </h2>
            <p className="text-base leading-8 text-white/68">
              We can tailor the walkthrough around gold chain-of-custody, school operations, retail and POS, auto sales, recycling, or the platform-admin layer.
            </p>
          </div>
          <DemoBookingForm
            schedulerHref={config.schedulerHref}
            schedulerExternal={config.schedulerExternal}
          />
        </div>
      </section>

      <footer className="border-t border-white/8 bg-[#0d1624]">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-10 text-white/68 lg:flex-row lg:items-end lg:justify-between lg:px-8">
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-sm font-semibold uppercase tracking-[0.2em] text-white">
              <span className="flex size-10 items-center justify-center rounded-2xl border border-white/10 bg-white/6">H</span>
              Huchu
            </div>
            <p className="max-w-2xl text-sm leading-7">
              One platform for operations, finance, control, and reporting across mines, schools, shops, dealerships, and multi-site businesses.
            </p>
          </div>
          <div className="flex flex-col gap-4 text-sm sm:flex-row sm:items-center sm:gap-6">
            <Link href="/home" className="hover:text-white">Home</Link>
            <a href="#platform" className="hover:text-white">Platform</a>
            <a href="#pricing" className="hover:text-white">Pricing</a>
            <Link href="/home/book-demo" className="hover:text-white">Book a demo</Link>
            <Link href="/login" className="hover:text-white">Sign in</Link>
          </div>
        </div>
      </footer>
    </>
  );
}
