import Link from "next/link";

import { ArrowRight } from "@/lib/icons";
import { PLATFORM_BRAND_INITIAL, PLATFORM_BRAND_NAME, PLATFORM_MARKETING_DOMAIN } from "@/lib/platform/brand";
import { marketingNavItems, proofStats, productSteps } from "@/components/marketing/marketing-data";
import { Button } from "@/components/ui/button";
import styles from "@/components/marketing/marketing-site.module.css";

const proofRail = ["Retail", "Schools", "Gold", "Auto sales", "Recycling", "Multi-site"];

export function MarketingHeaderHero() {
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[rgba(9,14,32,0.84)] backdrop-blur-2xl">
        <div className="mx-auto flex max-w-7xl items-center gap-6 px-6 py-4 lg:px-8">
          <Link href="/home" className="flex items-center gap-3 text-sm font-semibold uppercase tracking-[0.2em] text-white">
            <span className="flex size-9 items-center justify-center rounded-full bg-white text-[#1b2558]">{PLATFORM_BRAND_INITIAL}</span>
            {PLATFORM_BRAND_NAME}
          </Link>
          <nav className="hidden flex-1 items-center gap-8 text-sm text-white/68 lg:flex">
            {marketingNavItems.map((item) => (
              <Link key={item.href} href={item.href} className="transition-colors hover:text-white">
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <Button variant="ghost" asChild className="hidden text-white/72 hover:bg-white/10 hover:text-white sm:inline-flex">
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild className="h-11 rounded-full bg-white px-5 text-[#091127] hover:bg-white/90 hover:text-[#091127]">
              <Link href="/home/book-demo">
                Book a demo
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl gap-12 px-6 pb-20 pt-16 lg:grid-cols-[1.03fr_0.97fr] lg:items-center lg:px-8 lg:pb-28 lg:pt-24">
        <div className="max-w-3xl">
          <p className={styles.heroEyebrow}>For growing multi-site businesses</p>
          <h1 className="mt-5 max-w-[12ch] text-[clamp(3.2rem,7vw,6.5rem)] font-medium leading-[0.9] tracking-[-0.07em] text-white text-balance">
            Replace scattered tools with one clearer way to run the work.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-white/76">
            Corelith helps owners and operators bring sites, teams, approvals, stock, and reporting into one system so
            the business is easier to run every day.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" className="h-12 rounded-full bg-white px-6 text-[#091127] hover:bg-white/90 hover:text-[#091127]">
              <Link href="/home/book-demo">
                Book a demo
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button
              variant="outline"
              asChild
              size="lg"
              className="h-12 rounded-full border-white/20 bg-transparent px-6 text-white hover:bg-white/10 hover:text-white"
            >
              <Link href="/home/pricing">See pricing</Link>
            </Button>
          </div>
          <p className="mt-6 max-w-xl text-sm leading-6 text-white/58">
            Built for teams running more than one site, more than one workflow, or too many handoffs to manage by hand.
          </p>
        </div>

        <div className={styles.heroVisual}>
          <div className={styles.heroFrameBar}>
            <span />
            <span />
            <span />
            <div className={styles.heroFrameAddress}>{PLATFORM_MARKETING_DOMAIN} / business overview</div>
          </div>
          <div className={styles.heroSurface}>
            <div className={styles.heroStripePane}>
              <p className={styles.stripeEyebrow}>What changes</p>
              <p className="mt-2 text-3xl font-semibold tracking-[-0.05em] text-white">
                Sites, teams, and follow-up work become easier to see and manage.
              </p>
              <div className={styles.heroMetrics}>
                {proofStats.slice(0, 3).map((item) => (
                  <div key={item.label} className={styles.heroMetric}>
                    <strong>{item.value}</strong>
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>
              <div className={`${styles.heroFlow} mt-5`}>
                <div className={styles.heroFlowPanel}>
                  <p className={styles.heroFlowLabel}>How teams usually start</p>
                  <div className={styles.heroFlowList}>
                    {productSteps.map((step, index) => (
                      <div key={step} className={styles.heroFlowItem}>
                        <span>0{index + 1}</span>
                        <strong>{step}</strong>
                      </div>
                    ))}
                  </div>
                </div>
                <div className={styles.heroFlowPanel}>
                  <p className={styles.heroFlowLabel}>What leaders can follow</p>
                  <div className={styles.heroFlowList}>
                    {[
                      ["Daily work", "Tasks, handoffs, and approvals"],
                      ["Operations", "Stock, sites, people, and records"],
                      ["Reporting", "Clearer visibility for managers"],
                    ].map(([label, value]) => (
                      <div key={label} className={styles.heroFlowItem}>
                        <span>{label}</span>
                        <strong>{value}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className={styles.heroMiniRail}>
              {proofRail.map((item) => (
                <b key={item}>{item}</b>
              ))}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
