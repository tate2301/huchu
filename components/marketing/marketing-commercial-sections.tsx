import Link from "next/link";

import type { MarketingSiteConfig } from "@/lib/marketing-site";
import { PLATFORM_BRAND_NAME } from "@/lib/platform/brand";
import { addOns, demoHighlights, featuredAddOns, rolloutPaths } from "@/components/marketing/marketing-data";
import { DemoBookingForm } from "@/components/marketing/demo-booking-form";
import { Reveal, StaggerChildren, StaggerItem } from "@/components/marketing/motion";
import styles from "@/components/marketing/marketing-site.module.css";

type MarketingCommercialSectionsProps = {
  config: MarketingSiteConfig;
};

export function MarketingCommercialSections({ config }: MarketingCommercialSectionsProps) {
  return (
    <>
      <section className="mx-auto max-w-7xl px-6 pb-18 lg:px-8 lg:pb-24">
        <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
          <div className="space-y-5">
            <Reveal>
              <p className={styles.stripeEyebrow}>How teams usually start</p>
            </Reveal>
            <Reveal delay={0.05}>
              <h2 className="max-w-3xl text-[clamp(2.2rem,4vw,4rem)] font-semibold leading-[0.96] tracking-[-0.055em] text-[#0b1945] text-balance">
                Start with the workflow that is costing you the most time.
              </h2>
            </Reveal>
            <Reveal delay={0.1}>
              <p className="max-w-2xl text-base leading-8 text-[#2d3d66]/82">
                Most teams do not need an all-at-once rollout. They begin where the pressure is highest, prove the process,
                then expand to more sites, teams, and controls.
              </p>
            </Reveal>
          </div>

          <StaggerChildren className={styles.rolloutGrid}>
            {rolloutPaths.map((path) => (
              <StaggerItem key={path.title}>
                <article className={styles.rolloutCard}>
                  <p className="text-base font-semibold tracking-[-0.03em] text-[#0f1f55]">{path.title}</p>
                  <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#7383a9]">Start with</p>
                  <p className="mt-2 text-sm leading-7 text-[#31436f]/86">{path.start}</p>
                  <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#7383a9]">Expand into</p>
                  <p className="mt-2 text-sm leading-7 text-[#31436f]/86">{path.expand}</p>
                </article>
              </StaggerItem>
            ))}
          </StaggerChildren>
        </div>

        <div className="mt-12 grid gap-8 border-t border-[#d6def5] pt-8 lg:grid-cols-[0.72fr_1.28fr]">
          <div className="space-y-4">
            <Reveal>
              <p className={styles.stripeEyebrow}>What you can add later</p>
            </Reveal>
            <Reveal delay={0.05}>
              <p className="max-w-2xl text-lg leading-8 text-[#23345f]">
                Once the core workflow is working, you can add more depth around finance, compliance, maintenance,
                branding, portals, and reporting without starting over.
              </p>
            </Reveal>
          </div>
          <div className="space-y-4">
            <StaggerChildren staggerDelay={0.08} className="grid gap-3 sm:grid-cols-2">
              {featuredAddOns.map((item) => (
                <StaggerItem key={item.name}>
                  <div className={styles.addonCard}>
                    <div>
                      <p className="text-base font-semibold tracking-[-0.03em] text-[#0f1f55]">{item.name}</p>
                      <p className="mt-1 text-sm leading-7 text-[#31436f]/84">{item.note}</p>
                    </div>
                    <span className="font-mono text-sm font-semibold text-[#0b1945]">{item.price}</span>
                  </div>
                </StaggerItem>
              ))}
            </StaggerChildren>
            <div className={styles.addonCloud}>
              {addOns.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="demo" className="mx-auto max-w-7xl px-6 pb-20 lg:px-8 lg:pb-24">
        <Reveal>
          <div className={styles.ctaWrap}>
            <div className="grid gap-8 px-6 py-8 lg:grid-cols-[0.82fr_1.18fr] lg:px-10 lg:py-10">
              <div className="space-y-5 text-white">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/62">Demo</p>
                <h2 className="max-w-3xl text-[clamp(2rem,3.5vw,3.2rem)] font-semibold leading-[1.02] tracking-[-0.04em] text-balance">
                  Bring your busiest workflow. We&apos;ll show you a cleaner way to run it.
                </h2>
                <p className="max-w-2xl text-sm leading-7 text-white/74">
                  Bring the sites, handoffs, approvals, or reporting pain points that matter most. We will shape the demo
                  around your business, not a generic product tour.
                </p>
                <ul className={`${styles.simpleListInverse} mt-6`}>
                  {demoHighlights.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-[24px] border border-white/10 bg-white/6 p-4 shadow-[0_24px_72px_rgba(8,15,42,0.24)] backdrop-blur-sm">
                <DemoBookingForm schedulerHref={config.schedulerHref} schedulerExternal={config.schedulerExternal} />
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      <footer className={styles.footer}>
        <div className="mx-auto grid max-w-7xl gap-8 px-6 py-10 text-white/70 lg:grid-cols-[1.12fr_0.88fr] lg:px-8">
          <div className="space-y-3">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-white">{PLATFORM_BRAND_NAME}</p>
            <p className="max-w-2xl text-sm leading-7">
              One system for growing businesses that need clearer operations, stronger follow-through, and better
              reporting across teams and sites.
            </p>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm lg:justify-end">
            <Link href="/home" className="hover:text-white">
              Home
            </Link>
            <Link href="/home/product" className="hover:text-white">
              Product
            </Link>
            <Link href="/home/solutions" className="hover:text-white">
              Solutions
            </Link>
            <Link href="/home/pricing" className="hover:text-white">
              Pricing
            </Link>
            <Link href="/home/book-demo" className="hover:text-white">
              Demo
            </Link>
            <Link href="/login" className="hover:text-white">
              Sign in
            </Link>
          </div>
        </div>
      </footer>
    </>
  );
}
