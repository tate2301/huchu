import type { Metadata } from "next";
import Link from "next/link";

import { ArrowRight, Calendar, CheckCircle2, Gem, ReceiptLong, Users, Wrench } from "@/lib/icons";
import { getMarketingSiteConfig } from "@/lib/marketing-site";
import { DemoBookingForm } from "@/components/marketing/demo-booking-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import styles from "@/components/marketing/marketing-site.module.css";

export const metadata: Metadata = {
  title: "Book a demo",
  description:
    "Book a tailored Huchu demo for gold operations, schools, retail and POS, auto sales, scrap, or multi-site platform operations.",
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

      <header className="border-b border-white/60 bg-[rgba(249,246,238,0.82)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 lg:px-8">
          <Link href="/home" className="flex items-center gap-3 text-sm font-semibold uppercase tracking-[0.18em] text-foreground">
            <span className="flex size-10 items-center justify-center rounded-2xl border border-[var(--edge-default)] bg-white">H</span>
            Huchu
          </Link>
          <div className="flex items-center gap-3">
            <Button variant="ghost" asChild className="hidden sm:inline-flex">
              <Link href="/home">Back to home</Link>
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
        <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
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

            <div className={`${styles.glassPanel} rounded-[30px] p-6`}>
              <div className="mb-5 flex items-center justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    What we can show
                  </p>
                  <p className="mt-2 text-xl font-semibold tracking-[-0.03em] text-foreground">
                    Live demo tracks
                  </p>
                </div>
                <Calendar className="size-6 text-[var(--action-primary-bg)]" />
              </div>
              <div className="grid gap-3">
                {walkthroughTracks.map((track) => {
                  const Icon = track.icon;
                  return (
                    <div
                      key={track.title}
                      className="rounded-[22px] border border-white/70 bg-white/80 p-4 shadow-[0_18px_40px_rgba(24,32,48,0.06)]"
                    >
                      <div className="flex items-start gap-4">
                        <div className="flex size-11 items-center justify-center rounded-2xl bg-[rgba(216,168,84,0.12)] text-[var(--action-primary-bg)]">
                          <Icon className="size-5" />
                        </div>
                        <div className="space-y-2">
                          <p className="text-base font-semibold text-foreground">{track.title}</p>
                          <p className="text-sm leading-7 text-muted-foreground">{track.copy}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <Card className="rounded-[30px] border-white/70 bg-slate-950 text-white shadow-[0_24px_70px_rgba(17,24,39,0.24)]">
              <CardHeader className="space-y-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">
                  Before the session
                </p>
                <CardTitle className="text-[1.6rem] tracking-[-0.04em] text-white">
                  We tailor the walkthrough around your operator reality.
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  "Sites, branches, campuses, or yards",
                  "Key handoffs between operations and finance",
                  "Current spreadsheets or tools you want to replace",
                  "Reporting, audit, and governance needs",
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 size-5 text-emerald-400" />
                    <p className="text-sm leading-7 text-white/78">{item}</p>
                  </div>
                ))}
                <Button variant="secondary" asChild className="mt-2 w-full rounded-2xl">
                  <a
                    href={config.schedulerHref}
                    target={config.schedulerExternal ? "_blank" : undefined}
                    rel={config.schedulerExternal ? "noreferrer" : undefined}
                  >
                    Schedule instantly
                    <Calendar className="size-4" />
                  </a>
                </Button>
              </CardContent>
            </Card>
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
