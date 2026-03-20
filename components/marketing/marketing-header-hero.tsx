import Link from "next/link";

import { ArrowRight, BarChart3, Calendar } from "@/lib/icons";
import type { MarketingSiteConfig } from "@/lib/marketing-site";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { proofStats } from "@/components/marketing/marketing-data";
import styles from "@/components/marketing/marketing-site.module.css";

type MarketingHeaderHeroProps = {
  config: MarketingSiteConfig;
};

export function MarketingHeaderHero({ config }: MarketingHeaderHeroProps) {
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-white/60 bg-[rgba(249,246,238,0.78)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 lg:px-8">
          <Link href="/home" className="flex items-center gap-3 text-sm font-semibold uppercase tracking-[0.18em] text-foreground">
            <span className="flex size-10 items-center justify-center rounded-2xl border border-[var(--edge-default)] bg-white shadow-[0_12px_30px_rgba(24,32,48,0.08)]">
              H
            </span>
            Huchu
          </Link>
          <nav className="hidden items-center gap-8 text-sm font-medium text-muted-foreground lg:flex">
            <a href="#platform" className="transition-colors hover:text-foreground">Platform</a>
            <a href="#solutions" className="transition-colors hover:text-foreground">Solutions</a>
            <a href="#pricing" className="transition-colors hover:text-foreground">Pricing</a>
            <a href="#demo-form" className="transition-colors hover:text-foreground">Book a demo</a>
          </nav>
          <div className="flex items-center gap-3">
            <Button variant="ghost" asChild className="hidden sm:inline-flex">
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild>
              <Link href="/home/book-demo">
                Book a demo
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <section className="relative">
        <div className="mx-auto grid max-w-7xl gap-14 px-6 pb-16 pt-14 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:px-8 lg:pb-24 lg:pt-20">
          <div className="flex flex-col gap-8">
            <div className="flex flex-wrap gap-3">
              <Badge variant="warning" className="rounded-full px-4 py-1.5 text-[10px] uppercase tracking-[0.22em]">
                Backed by A16z
              </Badge>
              <Badge variant="brand" className="rounded-full px-4 py-1.5 text-[10px] uppercase tracking-[0.22em]">
                Backed by Y Combinator
              </Badge>
            </div>

            <div className="space-y-6">
              <p className="max-w-xl text-[11px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">
                Zimbabwe-ready operating platform
              </p>
              <h1 className="max-w-4xl text-[clamp(3.25rem,7vw,6.4rem)] font-semibold leading-[0.96] tracking-[-0.05em] text-balance text-foreground">
                One platform for operations, finance, control, and reporting.
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-slate-700">
                Huchu helps growing operators replace disconnected spreadsheets, siloed line-of-business tools, and ad hoc admin processes with one configurable platform for mines, schools, shops, dealerships, recyclers, and multi-site businesses.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="h-12 rounded-2xl px-6 text-sm">
                <Link href="/home/book-demo">
                  Book a live demo
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button variant="outline" asChild size="lg" className="h-12 rounded-2xl px-6 text-sm">
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

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {proofStats.map((item) => (
                <Card
                  key={item.label}
                  className={`${styles.heroStat} rounded-[24px] border-white/70 bg-white/78 shadow-[0_18px_55px_rgba(24,32,48,0.09)]`}
                >
                  <CardContent className="space-y-2 px-5 pt-5">
                    <p className="font-mono text-[2rem] font-semibold tracking-[-0.04em] text-foreground">
                      {item.value}
                    </p>
                    <p className="text-sm leading-6 text-muted-foreground">{item.label}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          <div className="relative">
            <div className={`${styles.browserWindow} ${styles.gridLines} min-h-[34rem] p-4 sm:p-5`}>
              <div className={styles.browserToolbar}>
                <div className={styles.browserDots} aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
                <div className={styles.browserAddress}>huchu.app/platform/control-plane</div>
              </div>

              <div className="grid gap-4 p-4 md:grid-cols-[1.2fr_0.8fr]">
                <div className={`${styles.metricTile} ${styles.marqueeCard} relative rounded-[24px] p-5`}>
                  <div className="mb-5 flex items-start justify-between gap-4">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                        Shared control plane
                      </p>
                      <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-foreground">
                        Vertical packs on one operating layer
                      </h2>
                    </div>
                    <div className="rounded-2xl bg-amber-100/80 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-950">
                      Live
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    {[
                      ["Gold", "Dispatches, receipts, payouts"],
                      ["Schools", "Admissions, fees, portals"],
                      ["Retail", "POS, purchasing, promotions"],
                      ["Platform admin", "Subscriptions, support, reliability"],
                    ].map(([title, copy]) => (
                      <div
                        key={title}
                        className="rounded-[20px] border border-[var(--edge-default)] bg-[rgba(248,245,238,0.88)] p-4"
                      >
                        <p className="text-sm font-semibold text-foreground">{title}</p>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">{copy}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid gap-4">
                  <div className={`${styles.darkPanel} relative rounded-[24px] p-5 text-white`}>
                    <div className={styles.accentRing} aria-hidden="true" />
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/65">
                      Operable SaaS
                    </p>
                    <p className="mt-4 text-3xl font-semibold tracking-[-0.04em]">Admin + audit + support</p>
                    <p className="mt-3 max-w-xs text-sm leading-6 text-white/74">
                      Reliability surfaces, support access flows, feature control, and commercial tooling are built into the platform itself.
                    </p>
                  </div>

                  <div className={`${styles.mockChart} p-5`}>
                    <div className="mb-5 flex items-center justify-between gap-4">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                          Reporting + finance
                        </p>
                        <p className="mt-2 text-xl font-semibold tracking-[-0.04em] text-foreground">
                          Operational and financial visibility
                        </p>
                      </div>
                      <BarChart3 className="size-7 text-[var(--action-primary-bg)]" />
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        ["39%", "Faster handoffs"],
                        ["5", "Role portals"],
                        ["12", "Billable add-ons"],
                      ].map(([value, copy]) => (
                        <div
                          key={copy}
                          className="rounded-[18px] border border-[var(--edge-default)] bg-white/80 p-4"
                        >
                          <p className="font-mono text-2xl font-semibold tracking-[-0.03em] text-foreground">{value}</p>
                          <p className="mt-2 text-xs leading-5 text-muted-foreground">{copy}</p>
                        </div>
                      ))}
                    </div>
                    <div className="mt-5 h-40 rounded-[20px] border border-[var(--edge-default)] bg-[linear-gradient(180deg,rgba(255,255,255,0.9),rgba(242,236,225,0.92))] p-4">
                      <div className="flex h-full items-end gap-3">
                        {["46%", "70%", "58%", "82%", "66%", "91%"].map((height, index) => (
                          <div key={height} className="flex flex-1 flex-col justify-end gap-2">
                            <div
                              className={`rounded-t-[14px] bg-gradient-to-t ${index % 2 === 0 ? "from-amber-400/80 to-amber-200" : "from-sky-500/85 to-sky-300"} transition-transform duration-200 hover:-translate-y-1`}
                              style={{ height }}
                            />
                            <div className="h-2 rounded-full bg-slate-200/80" />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className={`${styles.glassPanel} absolute -bottom-8 left-6 right-6 hidden rounded-[24px] p-4 lg:flex`}>
              <div className="grid flex-1 grid-cols-3 gap-3">
                {[
                  "Feature bundles, tiers, and tenant entitlements",
                  "Tax, accounting, reporting, and branded documents",
                  "Sector templates for gold, schools, retail, autos, and recycling",
                ].map((item) => (
                  <div key={item} className="rounded-[18px] border border-white/60 bg-white/75 p-3 text-sm leading-6 text-slate-700">
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
