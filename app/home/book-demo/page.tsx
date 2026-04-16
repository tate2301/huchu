import type { Metadata } from "next";
import Link from "next/link";

import { ArrowRight, Gem, ReceiptLong, Users, Wrench } from "@/lib/icons";
import { getMarketingSiteConfig } from "@/lib/marketing-site";
import { PLATFORM_BRAND_INITIAL, PLATFORM_BRAND_NAME } from "@/lib/platform/brand";
import {
  demoOutcomeItems,
  demoPreparationItems,
  marketingNavItems,
} from "@/components/marketing/marketing-data";
import { DemoBookingForm } from "@/components/marketing/demo-booking-form";
import styles from "@/components/marketing/marketing-site.module.css";

export const metadata: Metadata = {
  title: "Book a demo",
  description: `Book a tailored ${PLATFORM_BRAND_NAME} demo for gold operations, schools, retail and POS, auto sales, scrap, or multi-site platform operations.`,
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
    <div className={styles.page}>
      {/* Navigation */}
      <header className={styles.nav}>
        <div className={styles.navInner}>
          <Link href="/home" className={styles.navLogo}>
            <span className={styles.navLogoMark}>{PLATFORM_BRAND_INITIAL}</span>
            {PLATFORM_BRAND_NAME}
          </Link>
          <nav className={styles.navLinks} aria-label="Main navigation">
            {marketingNavItems.map((item) => (
              <Link key={item.href} href={item.href} className={styles.navLink}>
                {item.label}
              </Link>
            ))}
          </nav>
          <div className={styles.navActions}>
            <Link href="/login" className={`${styles.navSignIn} hidden sm:inline-flex`}>
              Sign in
            </Link>
            <Link href="/home/book-demo#demo-form" className={styles.navCta}>
              Book a demo
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <div className={styles.subpageHero} style={{ paddingBottom: "4rem" }}>
        <div className={styles.subpageHeroGlow} aria-hidden="true" />
        <div className={styles.subpageHeroInner}>
          <div className={styles.subpageBreadcrumb}>
            <span>{PLATFORM_BRAND_NAME}</span>
            <span className={styles.subpageBreadcrumbSep} aria-hidden="true" />
            <span>Book a demo</span>
          </div>
          <h1 className={styles.subpageTitle}>
            Book the walkthrough your team needs.
          </h1>
          <p className={styles.subpageSubtext}>
            Tell us your sites, roles, and rollout shape. We will tailor the session.
          </p>

          {/* Quick stats */}
          <div className={styles.demoMetrics} style={{ marginTop: "2rem", maxWidth: "32rem" }}>
            <div className={styles.demoMetricItem}>
              <div className={styles.demoMetricValue}>45 min</div>
              <div className={styles.demoMetricLabel}>Focused walkthrough</div>
            </div>
            <div className={styles.demoMetricItem}>
              <div className={styles.demoMetricValue}>Live</div>
              <div className={styles.demoMetricLabel}>Only shipped capability</div>
            </div>
            <div className={styles.demoMetricItem}>
              <div className={styles.demoMetricValue}>Next step</div>
              <div className={styles.demoMetricLabel}>Clear rollout path</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <main className={styles.subpageMain}>
        <div className={styles.subpageMainInner}>
          <div style={{ display: "grid", gap: "4rem", alignItems: "start" }}
            className="lg:grid-cols-[1fr_1.05fr]">

            {/* Left — detail */}
            <div style={{ display: "grid", gap: "2rem" }}>
              {/* Walkthrough tracks */}
              <div className={`${styles.card} ${styles.cardPadded}`}>
                <p className={styles.cardEyebrow} style={{ marginBottom: "1.25rem" }}>Coverage</p>
                <div style={{ display: "grid", gap: "0" }}>
                  {walkthroughTracks.map((track, index) => {
                    const Icon = track.icon;
                    return (
                      <div key={track.title} className={styles.demoTrackCard}>
                        <div className={styles.demoTrackRow} style={{ color: "inherit" }}>
                          <span className={styles.demoTrackIndex} style={{ color: "#2563eb" }}>0{index + 1}</span>
                          <div className={styles.demoTrackIcon} style={{ background: "rgba(37,99,235,0.08)", color: "#2563eb" }}>
                            <Icon className="size-4" />
                          </div>
                          <div>
                            <p className={styles.demoTrackTitle} style={{ color: "#0b1945" }}>{track.title}</p>
                            <p className={styles.demoTrackCopy} style={{ color: "rgba(45,69,118,0.7)" }}>{track.copy}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Prep + outcomes */}
              <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "1fr 1fr" }}>
                <div className={`${styles.card} ${styles.cardPadded}`}>
                  <p className={styles.cardTitle} style={{ marginTop: 0, marginBottom: "0.75rem" }}>What to bring</p>
                  <div style={{ display: "grid", gap: "0" }}>
                    {demoPreparationItems.map((item) => (
                      <div key={item} className={styles.demoListItem} style={{ color: "rgba(45,69,118,0.78)" }}>
                        <span className={styles.demoListDot} style={{ background: "#2563eb" }} />
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
                <div className={`${styles.card} ${styles.cardPadded}`}>
                  <p className={styles.cardTitle} style={{ marginTop: 0, marginBottom: "0.75rem" }}>What you leave with</p>
                  <div style={{ display: "grid", gap: "0" }}>
                    {demoOutcomeItems.map((item) => (
                      <div key={item} className={styles.demoListItem} style={{ color: "rgba(45,69,118,0.78)" }}>
                        <span className={styles.demoListDot} style={{ background: "#16a34a" }} />
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Right — form */}
            <div id="demo-form">
              <div className={styles.ctaBlock}>
                <div style={{ padding: "1.5rem" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem" }}>
                    <p className={styles.demoFormLabel}>Request details</p>
                    <span className={styles.demoFormBadge}>Reply in one day</span>
                  </div>
                  <DemoBookingForm
                    schedulerHref={config.schedulerHref}
                    schedulerExternal={config.schedulerExternal}
                    className="self-start"
                    title="Tell us what to cover"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
