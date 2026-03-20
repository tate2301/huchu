import { audienceSignals, proofStats, solutionStories, trustClaims, valuePillars, productSteps } from "@/components/marketing/marketing-data";
import styles from "@/components/marketing/marketing-site.module.css";

export function MarketingCoreSections() {
  return (
    <>
      <section id="product" className="mx-auto max-w-7xl px-6 pb-18 pt-10 lg:px-8 lg:pb-24">
        <div className="grid gap-12 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="space-y-5">
            <p className={styles.stripeEyebrow}>Product</p>
          <h2 className="text-[clamp(2.4rem,4.8vw,4.8rem)] font-semibold leading-[0.95] tracking-[-0.05em] text-[#0b1945] text-balance">
            One platform for operators that want structure without software sprawl.
          </h2>
          <p className="text-base leading-8 text-[#2c3b63]/80">
            Avenra gives multi-site teams one operating layer for workflows, finance, reporting, and administration, so rollout can start with one pack and expand without replacing the system underneath.
          </p>
          </div>

          <div className="space-y-5">
            {productSteps.map((item, index) => (
              <div key={item} className="flex gap-4 border-t border-[#d6def5] pt-4 first:border-t-0 first:pt-0">
                <span className="font-mono text-xs font-semibold tracking-[0.18em] text-[#7080a7]">
                  0{index + 1}
                </span>
                <p className="text-lg leading-8 text-[#1f2d52]">{item}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-12">
          <div className={styles.statBand}>
            {proofStats.map((entry) => (
              <div key={entry.label} className={styles.statCell}>
                <strong>{entry.value}</strong>
                <span>{entry.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-14 grid gap-10 md:grid-cols-2 xl:grid-cols-4">
          {valuePillars.map((pillar) => {
            const Icon = pillar.icon;
            return (
              <div key={pillar.title} className="border-t border-[#d6def5] pt-5">
                <div className="flex size-11 items-center justify-center rounded-full bg-[#0f1f55] text-white">
                  <Icon className="size-5" />
                </div>
                <p className="mt-4 text-xl font-semibold tracking-[-0.03em] text-[#0f1f55]">{pillar.title}</p>
                <p className="mt-3 text-sm leading-7 text-[#2d3d66]/80">{pillar.description}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section id="solutions" className="mx-auto max-w-7xl px-6 pb-18 lg:px-8 lg:pb-24">
        <div className="mb-12 max-w-3xl space-y-4">
          <p className={styles.stripeEyebrow}>Solutions</p>
          <h2 className="text-[clamp(2.2rem,4.5vw,4rem)] font-semibold leading-[0.98] tracking-[-0.05em] text-[#0b1945] text-balance">
            Clear sector stories, laid out as rows instead of promo tiles.
          </h2>
          <p className="max-w-2xl text-base leading-8 text-[#2d3d66]/80">
            Each solution sits on the same shared foundation, so teams can move across operations, finance, and reporting without stitching together separate tools for every business line.
          </p>
        </div>

        <div className="space-y-18">
          {solutionStories.map((row, index) => (
            <div
              key={row.eyebrow}
              className={`${styles.stripeRow} ${index % 2 === 1 ? "lg:[&>*:first-child]:order-2 lg:[&>*:last-child]:order-1" : ""}`}
            >
              <div>
                <p className={styles.stripeEyebrow}>{row.eyebrow}</p>
                <h3 className="mt-3 text-[clamp(2rem,3.6vw,3.2rem)] font-semibold leading-[1.02] tracking-[-0.045em] text-[#0b1945] text-balance">
                  {row.title}
                </h3>
                <p className="mt-5 text-base leading-8 text-[#2d3d66]/82">{row.copy}</p>
                <ul className={`${styles.simpleList} mt-6`}>
                  {row.points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </div>

              <div className={styles.stripeVisual}>
                <div className={styles.stripeVisualHead}>
                  <span />
                  <span />
                  <span />
                </div>
                <div className="space-y-5 p-5">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="border-b border-[#dce4f7] pb-3">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#7b88af]">Module</p>
                      <p className="mt-1 text-lg font-semibold tracking-[-0.04em] text-[#102252]">{row.eyebrow}</p>
                    </div>
                    <div className="border-b border-[#dce4f7] pb-3 sm:text-right">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#7b88af]">Status</p>
                      <p className="mt-1 text-lg font-semibold tracking-[-0.04em] text-[#102252]">Live workflow</p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className={`${styles.stripeLine} ${styles.stripeLineLong}`} />
                    <div className={`${styles.stripeLine} ${styles.stripeLineShort}`} />
                    <div className={`${styles.stripeLine} ${styles.stripeLineMedium}`} />
                    <div className={`${styles.stripeLine} ${styles.stripeLineLong}`} />
                    <div className={`${styles.stripeLine} ${styles.stripeLineShort}`} />
                    <div className={`${styles.stripeLine} ${styles.stripeLineMedium}`} />
                  </div>
                  <div className="grid gap-3 border-t border-[#dce4f7] pt-4 sm:grid-cols-3">
                    {row.points.map((point) => (
                      <div key={point} className="text-sm leading-6 text-[#324774]/78">
                        {point}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-16 lg:px-8 lg:pb-20">
        <div className="grid gap-10 lg:grid-cols-[0.88fr_1.12fr]">
          <div>
            <p className={styles.stripeEyebrow}>Live proof</p>
            <h3 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-[#0b1945] text-balance">
              Marketing-safe claims grounded in the shipped platform.
            </h3>
            <p className="mt-4 max-w-2xl text-base leading-8 text-[#2d3d66]/80">
              The story here is intentionally constrained to what is already represented in the live product, catalog, and workflow model.
            </p>
          </div>
          <div className="space-y-3">
            {trustClaims.map((claim) => (
              <p key={claim} className="border-t border-[#d6def5] pt-3 text-sm leading-7 text-[#2d3d66]/82">
                {claim}
              </p>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-18 lg:px-8 lg:pb-24">
        <p className={styles.stripeEyebrow}>Best fit</p>
        <div className="mt-4 max-w-3xl">
          <p className="text-base leading-8 text-[#2d3d66]/80">
            Avenra is a strong fit for operators managing multiple sites, multiple teams, or multiple workflow surfaces that still need one financial and reporting spine.
          </p>
        </div>
        <div className="mt-4 flex flex-wrap gap-2.5">
          {audienceSignals.map((signal) => (
            <span key={signal} className="rounded-full bg-[#e8edff] px-4 py-2 text-sm text-[#2f3f68]">
              {signal}
            </span>
          ))}
        </div>
      </section>
    </>
  );
}
