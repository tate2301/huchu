import Link from "next/link";
import type { Metadata } from "next";

import { ArrowRight } from "@/lib/icons";
import { PLATFORM_BRAND_NAME } from "@/lib/platform/brand";
import { solutionsSellingPoints } from "@/components/marketing/marketing-data";
import { MarketingSubpageShell } from "@/components/marketing/marketing-subpage-shell";
import { SolutionsGrid } from "@/components/marketing/solutions-grid";
import { Reveal, StaggerChildren, StaggerItem } from "@/components/marketing/motion";
import { Button } from "@/components/ui/button";
import styles from "@/components/marketing/marketing-site.module.css";

export const metadata: Metadata = {
  title: "Solutions",
  description: `Explore ${PLATFORM_BRAND_NAME} solutions for gold operations, schools, retail and POS, auto sales, scrap and recycling, and multi-site operators.`,
};

export default function SolutionsPage() {
  return (
    <MarketingSubpageShell
      eyebrow="Solutions"
      title="Solutions shaped around real operating problems."
      description={`${PLATFORM_BRAND_NAME} is sold best when buyers can see the business case that fits their day-to-day. Each solution sits on the same product base, with workflows tailored to how that business runs.`}
      pills={["Vertical solutions", "Shared product base", "Demo-led rollout"]}
      panelTitle="What owners want to know"
      panelBody="Does it fit how my business actually runs? Can we start with the pressure point now and expand later without buying a new system?"
      panelLinks={[
        { label: "Product base", href: "/home/product" },
        { label: "Book a demo", href: "/home/book-demo" },
      ]}
    >
      <SolutionsGrid />

      <section className="mt-18 grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
        <div className="space-y-4">
          <Reveal>
            <p className={styles.stripeEyebrow}>Why this sells better</p>
          </Reveal>
          <Reveal delay={0.05}>
            <h3 className="max-w-xl text-[clamp(1.95rem,3.6vw,3.2rem)] font-semibold leading-[0.98] tracking-[-0.05em] text-[#0b1945] text-balance">
              Buyers understand a solution faster than a generic platform pitch.
            </h3>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="max-w-xl text-base leading-8 text-[#2d3d66]/82">
              When the page speaks to the operating problem directly, business owners can see themselves in the story and
              judge fit much faster.
            </p>
          </Reveal>
        </div>

        <StaggerChildren staggerDelay={0.1} className="grid gap-4 md:grid-cols-3">
          {solutionsSellingPoints.map((point) => (
            <StaggerItem key={point.title}>
              <article
                className={`${styles.productFeatureCard} transition-transform duration-200 hover:-translate-y-1 hover:shadow-[0_24px_56px_rgba(29,39,79,0.1)]`}
              >
                <p className={styles.productFeatureEyebrow}>{point.title}</p>
                <p className="mt-3 text-sm leading-7 text-[#31436f]/84">{point.copy}</p>
              </article>
            </StaggerItem>
          ))}
        </StaggerChildren>
      </section>

      <section className={`mt-18 ${styles.ctaWrap} px-6 py-10 text-white lg:px-10`}>
        <div className="grid gap-8 lg:grid-cols-[0.88fr_1.12fr] lg:items-end">
          <div className="space-y-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/62">Next step</p>
            <h3 className="max-w-2xl text-[clamp(2rem,3.7vw,3.25rem)] font-semibold leading-[1.02] tracking-[-0.045em] text-balance">
              Book a demo around the business case that matches your operation.
            </h3>
            <p className="max-w-2xl text-sm leading-7 text-white/74">
              We will show you the right solution story, the shared product underneath it, and the rollout path that
              makes sense for your team.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <Button asChild size="lg" className="rounded-full bg-white text-[#091127] hover:bg-white/92 hover:text-[#091127]">
              <Link href="/home/book-demo">
                Book a demo
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="rounded-full border-white/18 bg-transparent text-white hover:bg-white/10 hover:text-white"
            >
              <Link href="/home/product">See the product base</Link>
            </Button>
          </div>
        </div>
      </section>
    </MarketingSubpageShell>
  );
}
