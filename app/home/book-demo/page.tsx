import type { Metadata } from "next";
import Link from "next/link";

import { ArrowRight, Calendar, CheckCircle2, Gem, ReceiptLong, Users, Wrench } from "@/lib/icons";
import { getMarketingSiteConfig } from "@/lib/marketing-site";
import { demoHighlights, marketingNavItems } from "@/components/marketing/marketing-data";
import { DemoBookingForm } from "@/components/marketing/demo-booking-form";
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
    <div className="min-h-screen overflow-x-clip bg-[linear-gradient(180deg,#0d1738_0_24rem,#f7f9ff_24rem_100%)]">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[rgba(9,14,32,0.84)] backdrop-blur-2xl">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-4 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <Link href="/home" className="flex items-center gap-3 text-sm font-semibold text-white">
            <span className="flex size-10 items-center justify-center rounded-2xl border border-white/10 bg-white/8 text-[11px] uppercase tracking-[0.22em]">
              A
            </span>
            Avenra
          </Link>
          <nav className="flex flex-wrap items-center gap-5 text-sm text-white/72">
            {marketingNavItems.map((item) => (
              <Link key={item.href} href={item.href} className="transition-colors hover:text-white">
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <Button variant="ghost" asChild className="hidden text-white hover:bg-white/10 hover:text-white sm:inline-flex">
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild className="h-11 rounded-full bg-white px-5 text-[#091127] hover:bg-white/90 hover:text-[#091127]">
              <Link href="/home/book-demo#demo-form">
                Book a demo
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-14 lg:px-8 lg:py-20">
        <section className="grid gap-12 lg:grid-cols-[0.94fr_1.06fr] lg:items-start">
          <div className="space-y-8 text-white">
            <div className={styles.demoHeader}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/58">Tailored walkthrough</p>
              <h1 className="max-w-3xl text-[clamp(2.8rem,5vw,5rem)] font-semibold leading-[0.95] tracking-[-0.055em] text-balance">
                Book the workflow walkthrough your team actually needs.
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-white/74">
                Tell us your operating model, your sites, and the controls you care about. We will shape the session around the packs, workflows, finance surfaces, and reporting stories that matter most.
              </p>
              <div className={styles.demoMetrics}>
                <div className={styles.demoMetric}>
                  <strong>45 min</strong>
                  <span>Structured walkthrough with time for specific workflow questions.</span>
                </div>
                <div className={styles.demoMetric}>
                  <strong>Live scope</strong>
                  <span>We focus on what already ships, not speculative roadmap theater.</span>
                </div>
                <div className={styles.demoMetric}>
                  <strong>Rollout fit</strong>
                  <span>Expect a recommendation on phase-one scope, expansion path, and packaging.</span>
                </div>
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-white/6 p-6 backdrop-blur-sm">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/54">
                What we can show
              </p>
              <div className="mt-4 grid gap-3">
                {walkthroughTracks.map((track, index) => {
                  const Icon = track.icon;
                  return (
                    <div key={track.title} className={styles.demoAgendaCard}>
                      <span className={styles.demoAgendaIndex}>0{index + 1}</span>
                      <div className="flex items-start gap-4">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-white">
                          <Icon className="size-4.5" />
                        </div>
                        <div className="space-y-1.5">
                          <p className="text-base font-semibold text-white">{track.title}</p>
                          <p className={styles.demoAgendaCopy}>{track.copy}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[0.88fr_1.12fr]">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/54">
                Before the session
                </p>
                <div className="mt-4 grid gap-4 text-sm leading-7 text-white/74">
                  {[
                  "Sites, branches, campuses, or yards",
                  "Key handoffs between operations and finance",
                  "Current spreadsheets or tools you want to replace",
                  "Reporting, audit, and governance needs",
                ].map((item) => (
                    <div key={item} className="flex items-start gap-3 border-t border-white/10 pt-4 first:border-t-0 first:pt-0">
                    <CheckCircle2 className="mt-0.5 size-5 text-emerald-300" />
                    <p>{item}</p>
                  </div>
                ))}
                </div>
              </div>

              <div className={styles.demoSupportRail}>
                {demoHighlights.map((item) => (
                  <div key={item} className={styles.demoSupportItem}>
                    <p className={styles.demoSupportTitle}>{item}</p>
                    <p className={styles.demoSupportCopy}>
                      We use this as a working agenda so the session stays relevant to your team.
                    </p>
                  </div>
                ))}
                <Button variant="secondary" asChild className="rounded-full bg-white text-[#091127] hover:bg-white/90 hover:text-[#091127]">
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

          <div className={styles.demoFormFrame}>
            <div className={styles.demoFormHeader}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/58">Request details</p>
              <span className="rounded-full border border-white/12 bg-white/6 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/66">
                Response within one business day
              </span>
            </div>
            <div className="px-6 pb-6 pt-4 lg:px-8">
              <div className={styles.demoFormStats}>
                <div className={styles.demoFormStat}>
                  <span className={styles.demoFormStatLabel}>Format</span>
                  <span className={styles.demoFormStatValue}>Live product walkthrough</span>
                </div>
                <div className={styles.demoFormStat}>
                  <span className={styles.demoFormStatLabel}>Focus</span>
                  <span className={styles.demoFormStatValue}>Real handoffs, controls, and rollout risks</span>
                </div>
                <div className={styles.demoFormStat}>
                  <span className={styles.demoFormStatLabel}>Output</span>
                  <span className={styles.demoFormStatValue}>Recommended phase-one path</span>
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
          </div>
        </section>
      </main>
    </div>
  );
}
