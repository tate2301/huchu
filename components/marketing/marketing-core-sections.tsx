import { Building2, CheckCircle2, Gem, ShieldCheck, Wrench } from "@/lib/icons";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  audienceSignals,
  showcaseCards,
  trustClaims,
  valuePillars,
  verticalCards,
} from "@/components/marketing/marketing-data";
import styles from "@/components/marketing/marketing-site.module.css";

export function MarketingCoreSections() {
  return (
    <>
      <section id="platform" className="scroll-mt-24">
        <div className="mx-auto max-w-7xl px-6 py-12 lg:px-8 lg:py-24">
          <div className="mb-10 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl space-y-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                Why Huchu
              </p>
              <h2 className="text-4xl font-semibold tracking-[-0.04em] text-balance text-foreground">
                A product story built on live platform capabilities, not generic ERP language.
              </h2>
            </div>
            <p className="max-w-xl text-base leading-7 text-muted-foreground">
              Huchu is strongest when the buyer has multiple sites, operational handoffs, control requirements, compliance pressure, and the need to roll out pack by pack rather than all at once.
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {valuePillars.map((pillar) => {
              const Icon = pillar.icon;
              return (
                <Card
                  key={pillar.title}
                  className={`${styles.marqueeCard} rounded-[26px] border-white/70 bg-white/80 shadow-[0_18px_50px_rgba(24,32,48,0.08)]`}
                >
                  <CardHeader className="space-y-4">
                    <div className="flex size-12 items-center justify-center rounded-2xl bg-[rgba(216,168,84,0.14)] text-[var(--action-primary-bg)]">
                      <Icon className="size-6" />
                    </div>
                    <CardTitle className="text-[1.35rem] tracking-[-0.03em]">{pillar.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm leading-7 text-muted-foreground">{pillar.description}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      <section className="border-y border-white/50 bg-[rgba(255,255,255,0.48)]">
        <div className="mx-auto grid max-w-7xl gap-8 px-6 py-12 lg:grid-cols-[1fr_1.25fr] lg:px-8 lg:py-16">
          <div className="space-y-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
              Safe to claim today
            </p>
            <h2 className="text-3xl font-semibold tracking-[-0.04em] text-balance text-foreground">
              Modern product aesthetics, grounded in what the system already does.
            </h2>
            <p className="text-base leading-7 text-muted-foreground">
              The marketing story here is anchored to the live product: multi-tenant controls, vertical workspaces, portals, commercial packaging, reporting, branding, accounting, and admin tooling.
            </p>
          </div>
          <div className="grid gap-3">
            {trustClaims.map((claim) => (
              <div
                key={claim}
                className="flex items-start gap-3 rounded-[20px] border border-white/70 bg-white/72 px-4 py-4 shadow-[0_16px_35px_rgba(24,32,48,0.05)]"
              >
                <CheckCircle2 className="mt-0.5 size-5 text-emerald-700" />
                <p className="text-sm leading-7 text-slate-700">{claim}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="solutions" className="scroll-mt-24">
        <div className="mx-auto max-w-7xl px-6 py-14 lg:px-8 lg:py-24">
          <div className="mb-10 max-w-3xl space-y-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
              Industry packs
            </p>
            <h2 className="text-4xl font-semibold tracking-[-0.04em] text-balance text-foreground">
              One operating platform with multiple sector stories already built in.
            </h2>
          </div>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {verticalCards.map((vertical) => {
              const Icon = vertical.icon;
              return (
                <Card
                  key={vertical.title}
                  className={`${styles.marqueeCard} rounded-[28px] border-white/70 bg-white/78 shadow-[0_18px_45px_rgba(24,32,48,0.08)]`}
                >
                  <CardHeader className="space-y-4">
                    <div className="flex size-12 items-center justify-center rounded-2xl bg-[rgba(59,93,145,0.11)] text-sky-700">
                      <Icon className="size-6" />
                    </div>
                    <CardTitle className="text-[1.35rem] tracking-[-0.03em]">{vertical.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm leading-7 text-muted-foreground">{vertical.description}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      <section className="border-y border-[rgba(112,126,148,0.12)] bg-[rgba(246,242,234,0.74)]">
        <div className="mx-auto max-w-7xl px-6 py-14 lg:px-8 lg:py-24">
          <div className="mb-10 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl space-y-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                Product surfaces
              </p>
              <h2 className="text-4xl font-semibold tracking-[-0.04em] text-balance text-foreground">
                Placeholder product visuals that mirror the strongest demo stories.
              </h2>
            </div>
            <p className="max-w-xl text-base leading-7 text-muted-foreground">
              These showcase blocks are ready to swap with real screenshots later, but they already map to the gold, school, retail, and platform-admin stories documented in the commercial guide.
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {showcaseCards.map((card, index) => (
              <Card
                key={card.title}
                className="overflow-hidden rounded-[30px] border-white/70 bg-white/82 shadow-[0_22px_55px_rgba(24,32,48,0.09)]"
              >
                <CardHeader className="space-y-3 pb-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                    {card.eyebrow}
                  </p>
                  <CardTitle className="text-[1.55rem] leading-tight tracking-[-0.04em]">
                    {card.title}
                  </CardTitle>
                  <CardDescription className="text-sm leading-7 text-muted-foreground">
                    {card.copy}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5 pt-6">
                  <div className={`${styles.browserWindow} overflow-hidden rounded-[24px]`}>
                    <div className={styles.browserToolbar}>
                      <div className={styles.browserDots} aria-hidden="true">
                        <span />
                        <span />
                        <span />
                      </div>
                      <div className={styles.browserAddress}>
                        {index === 0
                          ? "gold / dispatches / receipts / payouts"
                          : index === 1
                            ? "schools / admissions / finance / portals"
                            : "admin / subscriptions / reliability / support"}
                      </div>
                    </div>
                    <div className="grid gap-4 p-4">
                      <div className="grid grid-cols-[0.65fr_0.35fr] gap-3">
                        <div className="rounded-[18px] border border-[var(--edge-default)] bg-white/85 p-4">
                          <div className="mb-4 flex items-center justify-between gap-3">
                            <div>
                              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                Snapshot
                              </p>
                              <p className="mt-2 text-lg font-semibold tracking-[-0.03em] text-foreground">
                                Workflow view
                              </p>
                            </div>
                            {index === 0 ? (
                              <Gem className="size-6 text-amber-700" />
                            ) : index === 1 ? (
                              <Building2 className="size-6 text-sky-700" />
                            ) : (
                              <Wrench className="size-6 text-slate-700" />
                            )}
                          </div>
                          <div className={styles.placeholderBars}>
                            <span />
                            <span />
                            <span />
                            <span />
                          </div>
                        </div>
                        <div className="grid gap-3">
                          {["Ops", "Finance", "Audit"].map((tag) => (
                            <div
                              key={tag}
                              className="rounded-[18px] border border-[var(--edge-default)] bg-[rgba(248,244,236,0.92)] p-4"
                            >
                              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                {tag}
                              </p>
                              <p className="mt-2 font-mono text-xl font-semibold tracking-[-0.03em] text-foreground">
                                {tag === "Ops" ? "24" : tag === "Finance" ? "$128k" : "98%"}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="rounded-[18px] border border-[var(--edge-default)] bg-[rgba(247,242,234,0.96)] p-4">
                        <div className="mb-4 flex items-center justify-between">
                          <p className="text-sm font-semibold text-foreground">Control timeline</p>
                          <ShieldCheck className="size-5 text-emerald-700" />
                        </div>
                        <div className="space-y-3">
                          {["Capture", "Review", "Approve", "Report"].map((step, stepIndex) => (
                            <div key={step} className="flex items-center gap-3">
                              <div className="flex size-7 items-center justify-center rounded-full bg-white text-xs font-semibold text-slate-700">
                                {stepIndex + 1}
                              </div>
                              <div className="h-px flex-1 bg-[rgba(117,132,156,0.25)]" />
                              <p className="min-w-20 text-right text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                                {step}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {card.chips.map((chip) => (
                      <Badge key={chip} variant="outline" className="rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.18em]">
                        {chip}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-white/60 bg-[rgba(255,255,255,0.48)]">
        <div className="mx-auto grid max-w-7xl gap-10 px-6 py-14 lg:grid-cols-[0.9fr_1.1fr] lg:px-8 lg:py-20">
          <div className="space-y-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
              Best fit
            </p>
            <h2 className="text-4xl font-semibold tracking-[-0.04em] text-balance text-foreground">
              Strongest for operators with real handoffs, controls, and growth complexity.
            </h2>
            <p className="text-base leading-7 text-muted-foreground">
              Huchu is designed for organizations that need more than task tracking or generic bookkeeping, but do not want to stitch together separate systems for every department.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {audienceSignals.map((signal) => (
              <div
                key={signal}
                className="rounded-[22px] border border-white/70 bg-white/78 px-5 py-4 shadow-[0_16px_40px_rgba(24,32,48,0.06)]"
              >
                <p className="text-sm leading-7 text-slate-700">{signal}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
