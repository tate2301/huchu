import type { Metadata } from "next";
import Link from "next/link";

import { ArrowRight, Gem, ReceiptLong, Users, Wrench } from "@/lib/icons";
import { getMarketingSiteConfig } from "@/lib/marketing-site";
import {
  demoConfidencePoints,
  demoOutcomeItems,
  demoPreparationItems,
  marketingNavItems,
} from "@/components/marketing/marketing-data";
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
    copy: "Output, purchases, dispatches, receipts, payouts.",
  },
  {
    icon: Users,
    title: "School operations",
    copy: "Admissions, attendance, finance, boarding, portals.",
  },
  {
    icon: ReceiptLong,
    title: "Retail & POS",
    copy: "Catalog, POS, refunds, promotions, purchasing, close.",
  },
  {
    icon: Wrench,
    title: "Platform admin",
    copy: "Companies, subscriptions, add-ons, support, health.",
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
                Book the walkthrough your team needs.
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-white/74">
                Tell us your sites, roles, and rollout shape. We will tailor the session.
              </p>
              <div className={styles.demoMetrics}>
                <div className={styles.demoMetric}>
                  <strong>45 min</strong>
                  <span>Focused walkthrough.</span>
                </div>
                <div className={styles.demoMetric}>
                  <strong>Live</strong>
                  <span>Only shipped capability.</span>
                </div>
                <div className={styles.demoMetric}>
                  <strong>Next step</strong>
                  <span>A clear rollout path.</span>
                </div>
              </div>
            </div>

            <div className={styles.demoConfidenceStrip}>
              {demoConfidencePoints.map((item) => (
                <div key={item} className={styles.demoConfidenceItem}>
                  <span />
                  <p>{item}</p>
                </div>
              ))}
            </div>

            <div className="rounded-[28px] border border-white/10 bg-white/6 p-6 backdrop-blur-sm">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/54">
                Coverage
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

            <div className={styles.demoAgendaGrid}>
              <div className={styles.demoSupportItem}>
                <p className={styles.demoSupportTitle}>What to bring</p>
                <div className={styles.demoChecklistList}>
                  {demoPreparationItems.map((item) => (
                    <div key={item} className={styles.demoChecklistItem}>
                      <span className={styles.demoChecklistDot} aria-hidden="true" />
                      <p>{item}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className={styles.demoSupportItem}>
                <p className={styles.demoSupportTitle}>What you leave with</p>
                <div className={styles.demoChecklistList}>
                  {demoOutcomeItems.map((item) => (
                    <div key={item} className={styles.demoChecklistItem}>
                      <span className={styles.demoChecklistDot} aria-hidden="true" />
                      <p>{item}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className={styles.demoFormFrame}>
            <div className={styles.demoFormHeader}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/58">Request details</p>
              <span className="rounded-full border border-white/12 bg-white/6 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/66">
                Reply in one day
              </span>
            </div>
            <div className="px-6 pb-6 pt-4 lg:px-8">
              <div className={styles.demoFormStats}>
                <div className={styles.demoFormStat}>
                  <span className={styles.demoFormStatLabel}>Format</span>
                  <span className={styles.demoFormStatValue}>Live walkthrough.</span>
                </div>
                <div className={styles.demoFormStat}>
                  <span className={styles.demoFormStatLabel}>Focus</span>
                  <span className={styles.demoFormStatValue}>Handoffs and controls.</span>
                </div>
                <div className={styles.demoFormStat}>
                  <span className={styles.demoFormStatLabel}>Output</span>
                  <span className={styles.demoFormStatValue}>Phase-one path.</span>
                </div>
              </div>

              <DemoBookingForm
                schedulerHref={config.schedulerHref}
                schedulerExternal={config.schedulerExternal}
                className="self-start"
                title="Tell us what to cover"
                description="We will tailor the session to your sites and rollout path."
              />
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
