import type { Metadata } from "next";
import Link from "next/link";

import { ArrowRight, Calendar, CheckCircle2, Gem, ReceiptLong, Users, Wrench } from "@/lib/icons";
import { getMarketingSiteConfig } from "@/lib/marketing-site";
import { DemoBookingForm } from "@/components/marketing/demo-booking-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import styles from "@/components/marketing/marketing-site.module.css";

export const metadata: Metadata = {
  title: "Book a demo",
  description:
    "Book a tailored Avenra demo for gold operations, schools, retail and POS, auto sales, scrap, or multi-site platform operations.",
};

const walkthroughTracks = [
  {
    icon: Gem,
    title: "Gold operations",
    copy: "Output, purchases, dispatches, receipts, payout-related flows, and gold-chain reporting.",
  },
  {
    icon: Users,
    title: "School operations",
    copy: "Admissions, student directory, attendance, finance, boarding, notices, results, and portals.",
  },
  {
    icon: ReceiptLong,
    title: "Retail & POS",
    copy: "Catalog, POS, held carts, refund and void flows, promotions, purchasing, and shift close.",
  },
  {
    icon: Wrench,
    title: "Platform admin",
    copy: "Companies, subscriptions, add-ons, features, support access, reliability, and company-level detail.",
  },
];

export default function BookDemoPage() {
  const config = getMarketingSiteConfig();

  return (
    <div className={`${styles.page} min-h-screen overflow-x-clip`}>
      <div className={styles.heroGlowLeft} aria-hidden="true" />
      <div className={styles.heroGlowRight} aria-hidden="true" />

      <header className="border-b border-white/55 bg-[rgba(249,246,238,0.82)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-4 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <Link href="/home" className="flex items-center gap-3 text-sm font-semibold uppercase tracking-[0.18em] text-foreground">
            <span className="flex size-10 items-center justify-center rounded-2xl border border-[var(--edge-default)] bg-white">A</span>
            Avenra
          </Link>
          <nav className="flex flex-wrap items-center gap-5 text-sm text-slate-600">
            <Link href="/home/product" className="transition-colors hover:text-slate-950">Product</Link>
            <Link href="/home/solutions" className="transition-colors hover:text-slate-950">Solutions</Link>
            <Link href="/home/pricing" className="transition-colors hover:text-slate-950">Pricing</Link>
            <Link href="/home/book-demo" className="transition-colors hover:text-slate-950">Book a demo</Link>
          </nav>
          <div className="flex items-center gap-3">
            <Button variant="ghost" asChild className="hidden sm:inline-flex">
              <Link href="/home">Home</Link>
            </Button>
            <Button asChild>
              <Link href="/login">
                Sign in
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-14 lg:px-8 lg:py-20">
        <div className="grid gap-10 lg:grid-cols-[0.88fr_1.12fr]">
          <div className="space-y-8">
            <div className="space-y-5">
              <div className="flex flex-wrap gap-3">
                <Badge variant="warning" className="rounded-full px-4 py-1.5 text-[10px] uppercase tracking-[0.22em]">
                  Backed by A16z
                </Badge>
                <Badge variant="brand" className="rounded-full px-4 py-1.5 text-[10px] uppercase tracking-[0.22em]">
                  Backed by Y Combinator
                </Badge>
              </div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                Tailored walkthrough
              </p>
              <h1 className="text-[clamp(2.8rem,5vw,4.6rem)] font-semibold leading-[0.96] tracking-[-0.05em] text-balance text-foreground">
                Book the workflow walkthrough your team actually needs.
              </h1>
              <p className="max-w-xl text-lg leading-8 text-slate-700">
                Tell us your operating model, your sites, and the controls you care about. We will shape the session around the packs, workflows, finance surfaces, and reporting stories that matter most.
              </p>
            </div>

            <div className="border-t border-slate-200 pt-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                What we can show
              </p>
              <div className="mt-4 space-y-0">
                {walkthroughTracks.map((track) => {
                  const Icon = track.icon;
                  return (
                    <div key={track.title} className="flex items-start gap-4 border-t border-slate-200 py-4 first:border-t-0 first:pt-0">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[rgba(216,168,84,0.12)] text-[var(--action-primary-bg)]">
                        <Icon className="size-4.5" />
                      </div>
                      <div className="space-y-1.5">
                        <p className="text-base font-semibold text-foreground">{track.title}</p>
                        <p className="text-sm leading-7 text-slate-600">{track.copy}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="border-t border-slate-200 pt-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Before the session
              </p>
              <div className="mt-4 grid gap-4 text-sm leading-7 text-slate-700">
                {[
                  "Sites, branches, campuses, or yards",
                  "Key handoffs between operations and finance",
                  "Current spreadsheets or tools you want to replace",
                  "Reporting, audit, and governance needs",
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3 border-t border-slate-200 pt-4 first:border-t-0 first:pt-0">
                    <CheckCircle2 className="mt-0.5 size-5 text-emerald-500" />
                    <p>{item}</p>
                  </div>
                ))}
              </div>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button variant="secondary" asChild className="rounded-full">
                  <a
                    href={config.schedulerHref}
                    target={config.schedulerExternal ? "_blank" : undefined}
                    rel={config.schedulerExternal ? "noreferrer" : undefined}
                  >
                    Schedule instantly
                    <Calendar className="size-4" />
                  </a>
                </Button>
              </div>
            </div>
          </div>

          <DemoBookingForm
            schedulerHref={config.schedulerHref}
            schedulerExternal={config.schedulerExternal}
            className="self-start"
            title="Tell us your stack, your workflows, and what you want to see"
            description="We will use this to tailor the session around the operational packs, control flows, reporting surfaces, and pricing path that fit your team."
          />
        </div>
      </main>
    </div>
  );
}
