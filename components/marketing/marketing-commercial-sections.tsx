import Link from "next/link";

import { ArrowRight } from "@/lib/icons";
import type { MarketingSiteConfig } from "@/lib/marketing-site";
import { DemoBookingForm } from "@/components/marketing/demo-booking-form";
import { addOns, pricingTiers } from "@/components/marketing/marketing-data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type MarketingCommercialSectionsProps = {
  config: MarketingSiteConfig;
};

export function MarketingCommercialSections({ config }: MarketingCommercialSectionsProps) {
  return (
    <>
      <section id="pricing" className="scroll-mt-24">
        <div className="mx-auto max-w-7xl px-6 py-14 lg:px-8 lg:py-24">
          <div className="mb-10 max-w-3xl space-y-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
              Pricing
            </p>
            <h2 className="text-4xl font-semibold tracking-[-0.04em] text-balance text-foreground">
              Commercial packaging that maps directly to live entitlements.
            </h2>
            <p className="text-base leading-7 text-muted-foreground">
              The product already contains subscription tiers, add-on dependencies, company-level enablement, and user-level feature control. Pricing here is grounded in the current commercial catalog.
            </p>
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            {pricingTiers.map((tier, index) => (
              <Card
                key={tier.tier}
                className={`rounded-[30px] border-white/70 shadow-[0_20px_50px_rgba(24,32,48,0.08)] ${
                  index === 1 ? "bg-slate-950 text-white" : "bg-white/80"
                }`}
              >
                <CardHeader className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle className={`text-[1.5rem] tracking-[-0.04em] ${index === 1 ? "text-white" : ""}`}>
                      {tier.tier}
                    </CardTitle>
                    {index === 1 ? (
                      <Badge variant="warning" className="rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.2em]">
                        Recommended
                      </Badge>
                    ) : null}
                  </div>
                  <div className="space-y-2">
                    <p className={`font-mono text-[3rem] font-semibold tracking-[-0.06em] ${index === 1 ? "text-white" : "text-foreground"}`}>
                      {tier.price}
                    </p>
                    <p className={index === 1 ? "text-sm text-white/74" : "text-sm text-muted-foreground"}>
                      per month
                    </p>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className={`rounded-[20px] border p-4 ${index === 1 ? "border-white/12 bg-white/6" : "border-[var(--edge-default)] bg-[rgba(248,244,236,0.88)]"}`}>
                    <p className={`text-sm font-semibold ${index === 1 ? "text-white" : "text-foreground"}`}>{tier.sites}</p>
                    <p className={`mt-2 text-sm ${index === 1 ? "text-white/68" : "text-muted-foreground"}`}>{tier.extraSite}</p>
                  </div>
                  <p className={index === 1 ? "text-sm leading-7 text-white/74" : "text-sm leading-7 text-muted-foreground"}>
                    {tier.summary}
                  </p>
                  <Button
                    variant={index === 1 ? "secondary" : "outline"}
                    asChild
                    className="w-full rounded-2xl"
                  >
                    <Link href="/home/book-demo">
                      Talk through packaging
                      <ArrowRight className="size-4" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="mt-8 rounded-[30px] border border-white/60 bg-white/74 p-6 shadow-[0_20px_60px_rgba(24,32,48,0.06)]">
            <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Current add-on bundles
                </p>
                <p className="mt-2 text-lg font-semibold tracking-[-0.03em] text-foreground">
                  Expand into advanced workflows without rebuilding your stack.
                </p>
              </div>
              <p className="max-w-xl text-sm leading-7 text-muted-foreground">
                Examples include accounting core and advanced, schools, retail, autos, gold advanced, CCTV, maintenance, compliance, branding, portals, and analytics.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {addOns.map((item) => (
                <Badge key={item} variant="outline" className="rounded-full px-3 py-1.5 text-[11px] uppercase tracking-[0.18em]">
                  {item}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-14 lg:px-8 lg:py-24">
        <div className="mb-8 max-w-3xl space-y-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            Book a demo
          </p>
          <h2 className="text-4xl font-semibold tracking-[-0.04em] text-balance text-foreground">
            Tell us the workflows you run today and we will tailor the walkthrough.
          </h2>
          <p className="text-base leading-7 text-muted-foreground">
            We can show gold chain-of-custody, schools operations, retail and POS, auto sales, or the platform admin/commercial layer depending on your operating model.
          </p>
        </div>
        <DemoBookingForm
          schedulerHref={config.schedulerHref}
          schedulerExternal={config.schedulerExternal}
        />
      </section>

      <footer className="border-t border-white/60 bg-[rgba(247,243,235,0.94)]">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 px-6 py-10 lg:flex-row lg:items-end lg:justify-between lg:px-8">
          <div className="space-y-4">
            <div className="flex items-center gap-3 text-sm font-semibold uppercase tracking-[0.2em] text-foreground">
              <span className="flex size-10 items-center justify-center rounded-2xl border border-[var(--edge-default)] bg-white">H</span>
              Huchu
            </div>
            <p className="max-w-2xl text-sm leading-7 text-muted-foreground">
              A verticalized operating platform with a shared multi-tenant control plane, sector templates, and commercialization logic built directly into the application layer.
            </p>
          </div>
          <div className="flex flex-col gap-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:gap-6">
            <Link href="/home">Home</Link>
            <a href="#solutions">Solutions</a>
            <a href="#pricing">Pricing</a>
            <Link href="/home/book-demo">Book a demo</Link>
            <Link href="/login">Sign in</Link>
          </div>
        </div>
      </footer>
    </>
  );
}
