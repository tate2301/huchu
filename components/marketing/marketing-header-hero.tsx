import Link from "next/link";

import { ArrowRight, Calendar } from "@/lib/icons";
import type { MarketingSiteConfig } from "@/lib/marketing-site";
import { proofStats } from "@/components/marketing/marketing-data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import styles from "@/components/marketing/marketing-site.module.css";

type MarketingHeaderHeroProps = {
  config: MarketingSiteConfig;
};

const proofRail = [
  "Gold operations",
  "Schools",
  "Retail & POS",
  "Auto sales",
  "Platform admin",
];

export function MarketingHeaderHero({ config }: MarketingHeaderHeroProps) {
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-white/8 bg-[rgba(11,17,28,0.78)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 lg:px-8">
          <Link href="/home" className="flex items-center gap-3 text-sm font-semibold uppercase tracking-[0.2em] text-white">
            <span className="flex size-10 items-center justify-center rounded-2xl border border-white/10 bg-white/6">H</span>
            Huchu
          </Link>
          <nav className="hidden items-center gap-8 text-sm text-white/62 lg:flex">
            <a href="#platform" className="transition-colors hover:text-white">Platform</a>
            <a href="#showcase" className="transition-colors hover:text-white">Showcase</a>
            <a href="#pricing" className="transition-colors hover:text-white">Pricing</a>
            <a href="#demo-form" className="transition-colors hover:text-white">Book a demo</a>
          </nav>
          <div className="flex items-center gap-3">
            <Button variant="ghost" asChild className="hidden text-white hover:bg-white/8 hover:text-white sm:inline-flex">
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild className="rounded-full">
              <Link href="/home/book-demo">
                Book a demo
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-6 pb-16 pt-16 lg:px-8 lg:pb-24 lg:pt-24">
        <div className="mx-auto max-w-4xl text-center">
          <div className="mb-6 flex flex-wrap items-center justify-center gap-3">
            <Badge variant="warning" className="rounded-full px-4 py-1.5 text-[10px] uppercase tracking-[0.24em]">
              Backed by A16z
            </Badge>
            <Badge variant="brand" className="rounded-full px-4 py-1.5 text-[10px] uppercase tracking-[0.24em]">
              Backed by Y Combinator
            </Badge>
          </div>
          <p className="mb-5 text-[11px] font-semibold uppercase tracking-[0.28em] text-white/56">
            Vertical operating system
          </p>
          <h1 className="text-[clamp(3.5rem,8vw,7.2rem)] font-semibold leading-[0.9] tracking-[-0.06em] text-white text-balance">
            The operating platform for complex, multi-site businesses.
          </h1>
          <p className="mx-auto mt-6 max-w-3xl text-lg leading-8 text-white/70">
            Run sector-specific workflows on shared accounting, reporting, branding, administration, and control rails instead of stitching together disconnected tools.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="h-12 rounded-full px-6">
              <Link href="/home/book-demo">
                Book a live demo
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button
              variant="outline"
              asChild
              size="lg"
              className="h-12 rounded-full border-white/14 bg-white/4 px-6 text-white hover:border-white/24 hover:bg-white/8 hover:text-white"
            >
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
        </div>

        <div className="mt-16">
          <div className={styles.heroFrame}>
            <div className={styles.frameChrome}>
              <span />
              <span />
              <span />
              <div className={styles.frameAddress}>huchu.app/control-plane</div>
            </div>
            <div className={styles.frameCanvas}>
              <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
                <div className={styles.heroPrimary}>
                  <div className="mb-5 flex items-center justify-between gap-4">
                    <div>
                      <p className={styles.eyebrow}>Shared operating layer</p>
                      <p className="mt-2 text-[1.9rem] font-semibold tracking-[-0.05em] text-white">
                        One control plane. Multiple vertical packs.
                      </p>
                    </div>
                    <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">
                      Live
                    </div>
                  </div>
                  <div className={styles.heroMetrics}>
                    {proofStats.slice(0, 3).map((item) => (
                      <div key={item.label} className={styles.metricPanel}>
                        <strong>{item.value}</strong>
                        <span>{item.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="grid gap-4">
                  <div className="rounded-[24px] border border-white/10 bg-white/4 p-5">
                    <p className={styles.eyebrow}>Commercial model</p>
                    <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-white">$450 to $1,800</p>
                    <p className="mt-2 text-sm leading-7 text-white/66">
                      Tiered pricing, add-ons, tenant entitlements, and expansion paths are already built into the application layer.
                    </p>
                  </div>
                  <div className="rounded-[24px] border border-white/10 bg-[rgba(236,193,101,0.07)] p-5">
                    <p className={styles.eyebrow}>Buyer signal</p>
                    <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-white">
                      Replace fragmented tools with one operating system.
                    </p>
                  </div>
                </div>
              </div>
              <div className={styles.heroRail}>
                {proofRail.map((item) => (
                  <div key={item} className={styles.railCard}>
                    <p className={styles.eyebrow}>Pack</p>
                    <p className="mt-2 text-sm font-semibold text-white">{item}</p>
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
