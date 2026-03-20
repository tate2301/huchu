import { CheckCircle2 } from "@/lib/icons";
import { audienceSignals, showcaseCards, trustClaims, valuePillars } from "@/components/marketing/marketing-data";
import { Badge } from "@/components/ui/badge";
import styles from "@/components/marketing/marketing-site.module.css";

const operatingSequence = [
  {
    step: "01",
    title: "Choose the pack that fits the business",
    description:
      "Gold, schools, retail, auto sales, recycling, and broader multi-site operations all sit on the same platform foundation.",
  },
  {
    step: "02",
    title: "Run operations and finance on shared rails",
    description:
      "Workflows, reporting, accounting, branding, and administration stay aligned instead of being split across disconnected systems.",
  },
  {
    step: "03",
    title: "Expand without replacing the stack",
    description:
      "Turn on add-ons for accounting, CCTV, maintenance, compliance, portals, and advanced workflow control as the business matures.",
  },
];

export function MarketingCoreSections() {
  return (
    <div className={styles.body}>
      <section id="platform" className={styles.bodySection}>
        <div className="mx-auto max-w-7xl px-6 py-20 lg:px-8 lg:py-28">
          <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr]">
            <div className="space-y-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                Platform model
              </p>
              <h2 className="text-[clamp(2.5rem,5vw,4.6rem)] font-semibold leading-[0.96] tracking-[-0.05em] text-balance text-slate-950">
                Built for operators who have real handoffs, controls, and site complexity.
              </h2>
              <p className="max-w-xl text-base leading-8 text-slate-600">
                Huchu is strongest when the buyer has multiple sites, operational handoffs between departments, cash or stock controls, audit pressure, and a need to roll out capabilities pack by pack.
              </p>
            </div>

            <div className={styles.processLine}>
              {operatingSequence.map((item) => (
                <div key={item.step} className={styles.processStep}>
                  <div className="grid gap-4 lg:grid-cols-[auto_1fr]">
                    <span className="font-mono text-sm font-semibold tracking-[0.18em] text-slate-400">
                      {item.step}
                    </span>
                    <div>
                      <p className="text-2xl font-semibold tracking-[-0.04em] text-slate-950">{item.title}</p>
                      <p className="mt-3 max-w-2xl text-base leading-8 text-slate-600">{item.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className={styles.bodySection}>
        <div className="mx-auto max-w-7xl px-6 py-18 lg:px-8 lg:py-24">
          <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
            <div className="space-y-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                Why buyers care
              </p>
              <h2 className="text-4xl font-semibold tracking-[-0.04em] text-balance text-slate-950">
                Replace fragmented tools with one platform that actually holds together under growth.
              </h2>
            </div>
            <div className="grid gap-8 md:grid-cols-2">
              {valuePillars.map((pillar) => {
                const Icon = pillar.icon;
                return (
                  <div key={pillar.title} className="border-t border-slate-200 pt-5">
                    <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-slate-950 text-white">
                      <Icon className="size-6" />
                    </div>
                    <p className="text-xl font-semibold tracking-[-0.03em] text-slate-950">{pillar.title}</p>
                    <p className="mt-3 text-sm leading-7 text-slate-600">{pillar.description}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section id="showcase" className={styles.bodySection}>
        <div className="mx-auto max-w-7xl px-6 py-18 lg:px-8 lg:py-24">
          <div className="mb-12 max-w-3xl space-y-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
              Showcase
            </p>
            <h2 className="text-[clamp(2.4rem,4vw,4.3rem)] font-semibold leading-[0.98] tracking-[-0.05em] text-balance text-slate-950">
              The story is the product surface, not a stack of feature cards.
            </h2>
          </div>

          <div className="space-y-14">
            {showcaseCards.map((card, index) => (
              <div
                key={card.title}
                className={`grid gap-8 lg:grid-cols-[0.72fr_1.28fr] lg:items-center ${index % 2 === 1 ? "lg:[&>*:first-child]:order-2 lg:[&>*:last-child]:order-1" : ""}`}
              >
                <div className="space-y-5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                    {card.eyebrow}
                  </p>
                  <h3 className="text-3xl font-semibold leading-tight tracking-[-0.04em] text-slate-950">
                    {card.title}
                  </h3>
                  <p className="max-w-xl text-base leading-8 text-slate-600">{card.copy}</p>
                  <div className="flex flex-wrap gap-2">
                    {card.chips.map((chip) => (
                      <Badge key={chip} variant="outline" className="rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-slate-700">
                        {chip}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className={styles.showcaseVisual}>
                  <div className="flex items-center gap-3 border-b border-slate-200 bg-white/72 px-4 py-4">
                    <div className="flex items-center gap-2" aria-hidden="true">
                      <span className="size-2.5 rounded-full bg-slate-300" />
                      <span className="size-2.5 rounded-full bg-slate-300" />
                      <span className="size-2.5 rounded-full bg-slate-300" />
                    </div>
                    <div className="ml-auto max-w-64 overflow-hidden rounded-full bg-slate-100 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                      {index === 0
                        ? "gold / dispatches / receipts / payouts"
                        : index === 1
                          ? "schools / admissions / finance / portals"
                          : "admin / subscriptions / reliability / support"}
                    </div>
                  </div>
                  <div className={styles.showcaseInner}>
                    <div className={styles.showcaseTop}>
                      <div className={styles.tableMock}>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                          Workflow
                        </p>
                        <p className="mt-2 text-lg font-semibold tracking-[-0.03em] text-slate-950">
                          Controlled surface
                        </p>
                        <div className={`${styles.bars} mt-5`}>
                          <span />
                          <span />
                          <span />
                          <span />
                        </div>
                      </div>
                      <div className={`${styles.stackMock} space-y-3`}>
                        {["Ops", "Finance", "Audit"].map((tag) => (
                          <div
                            key={tag}
                            className="rounded-[16px] border border-slate-200 bg-white px-4 py-3"
                          >
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                              {tag}
                            </p>
                            <p className="mt-2 font-mono text-xl font-semibold tracking-[-0.04em] text-slate-950">
                              {tag === "Ops" ? "24" : tag === "Finance" ? "$128k" : "98%"}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className={styles.tableMock}>
                      <div className="mb-4 flex items-center justify-between">
                        <p className="text-sm font-semibold text-slate-950">Control sequence</p>
                        <CheckCircle2 className="size-5 text-emerald-700" />
                      </div>
                      <div className={styles.timeline}>
                        {["Capture", "Review", "Approve", "Report"].map((step, stepIndex) => (
                          <div key={step} className={styles.timelineRow}>
                            <em>{stepIndex + 1}</em>
                            <span />
                            <strong>{step}</strong>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.bodySection}>
        <div className="mx-auto max-w-7xl px-6 py-18 lg:px-8 lg:py-24">
          <div className="grid gap-12 lg:grid-cols-[0.92fr_1.08fr]">
            <div className="space-y-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                What is live
              </p>
              <h2 className="text-4xl font-semibold tracking-[-0.04em] text-balance text-slate-950">
                Marketing-safe proof points, not vapor.
              </h2>
            </div>
            <div className="grid gap-3">
              {trustClaims.map((claim) => (
                <div
                  key={claim}
                  className="flex items-start gap-3 border-t border-slate-200 py-4"
                >
                  <CheckCircle2 className="mt-0.5 size-5 text-emerald-700" />
                  <p className="text-sm leading-7 text-slate-600">{claim}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className={styles.bodySection}>
        <div className="mx-auto max-w-7xl px-6 py-18 lg:px-8 lg:py-24">
          <div className="mb-8 max-w-3xl space-y-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
              Best fit
            </p>
            <h2 className="text-4xl font-semibold tracking-[-0.04em] text-balance text-slate-950">
              Strongest for buyers with operational pressure and real governance needs.
            </h2>
          </div>
          <div className="flex flex-wrap gap-3">
            {audienceSignals.map((signal) => (
              <div
                key={signal}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 shadow-[0_10px_30px_rgba(24,32,48,0.05)]"
              >
                {signal}
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
