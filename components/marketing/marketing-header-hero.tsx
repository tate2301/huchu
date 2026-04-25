import Link from "next/link";

import { ArrowRight, CheckCircle } from "@/lib/icons";
import { PLATFORM_BRAND_INITIAL, PLATFORM_BRAND_NAME, PLATFORM_MARKETING_DOMAIN } from "@/lib/platform/brand";
import { marketingNavItems, productSteps } from "@/components/marketing/marketing-data";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/marketing/motion";
import styles from "@/components/marketing/marketing-site.module.css";

const proofRail = ["Gold", "Scrap", "Retail", "Schools", "Auto", "Multi-site"];

export function MarketingHeaderHero() {
  const landingNavItems = [marketingNavItems[0], marketingNavItems[1], marketingNavItems[3]];

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[rgba(9,14,32,0.88)] backdrop-blur-2xl">
        <div className="mx-auto flex max-w-7xl items-center gap-6 px-6 py-4 lg:px-8">
          <Link href="/home" className="flex items-center gap-3 text-sm font-semibold uppercase tracking-[0.2em] text-white">
            <span className="flex size-9 items-center justify-center rounded-full bg-white text-[#1b2558]">{PLATFORM_BRAND_INITIAL}</span>
            {PLATFORM_BRAND_NAME}
          </Link>
          <nav className="hidden flex-1 items-center gap-8 text-sm text-white/68 lg:flex">
            {landingNavItems.map((item) => (
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
                Start free trial
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl gap-12 px-6 pb-20 pt-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:px-8 lg:pb-28 lg:pt-24">
        <div className="max-w-3xl">
          <Reveal>
            <p className={styles.heroEyebrow}>Built in Zimbabwe for Zimbabwe businesses</p>
          </Reveal>
          <Reveal delay={0.1}>
            <h1 className="mt-5 max-w-[14ch] text-[clamp(3.2rem,7vw,6.5rem)] font-medium leading-[0.9] tracking-[-0.07em] text-white text-balance">
              Stop losing money to missing stock and broken records.
            </h1>
          </Reveal>
          <Reveal delay={0.2}>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-white/76">
              Zimbabwe businesses run on notebooks, WhatsApp, and memory. We built something better. One system that tracks your stock, your sales, your people, and your money — even when the internet is down.
            </p>
          </Reveal>
          <Reveal delay={0.3}>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="h-12 rounded-full bg-white px-6 text-[#091127] hover:bg-white/90 hover:text-[#091127]">
                <Link href="/home/book-demo">
                  Start Free for 14 Days
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-12 rounded-full border-white/18 bg-white/6 px-6 text-white hover:bg-white/10 hover:text-white">
                <Link href="/home/solutions">See solutions</Link>
              </Button>
            </div>
          </Reveal>
          <Reveal delay={0.35}>
            <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-white/58">
              <span className="flex items-center gap-1.5">
                <CheckCircle className="size-4 text-[#4ade80]" />
                Works offline
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle className="size-4 text-[#4ade80]" />
                Set up in 5 minutes
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle className="size-4 text-[#4ade80]" />
                Cancel anytime
              </span>
            </div>
          </Reveal>
        </div>

        <Reveal delay={0.25} className="h-full">
          <div className={`${styles.heroVisual} h-full`}>
            <div className={styles.heroFrameBar}>
              <span />
              <span />
              <span />
              <div className={styles.heroFrameAddress}>{PLATFORM_MARKETING_DOMAIN} / business overview</div>
            </div>
            <div className={styles.heroSurface}>
              <div className={styles.heroStripePane}>
                <p className={styles.stripeEyebrow}>What changes</p>
                <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-white sm:text-3xl">
                  From chaos to clarity — one record at a time.
                </p>
                <div className={styles.heroMetrics}>
                  {[
                    { value: "$39", label: "Starting price /mo" },
                    { value: "100%", label: "Offline capable" },
                    { value: "14-day", label: "Free trial" },
                  ].map((item) => (
                    <div key={item.label} className={styles.heroMetric}>
                      <strong>{item.value}</strong>
                      <span>{item.label}</span>
                    </div>
                  ))}
                </div>
                <div className={`${styles.heroFlow} mt-5`}>
                  <div className={styles.heroFlowPanel}>
                    <p className={styles.heroFlowLabel}>How teams start</p>
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
                    <p className={styles.heroFlowLabel}>What you get</p>
                    <div className={styles.heroFlowList}>
                      {[
                        ["Stock", "Live levels on your phone"],
                        ["Sales", "Connected to inventory"],
                        ["Reporting", "Auto-generated daily"],
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
        </Reveal>
      </section>
    </>
  );
}
