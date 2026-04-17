import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ArrowRight } from "@/lib/icons";
import { PLATFORM_BRAND_NAME } from "@/lib/platform/brand";
import { getSolutionPage, solutionPages } from "@/components/marketing/marketing-data";
import { MarketingSubpageShell } from "@/components/marketing/marketing-subpage-shell";
import { Reveal, StaggerChildren, StaggerItem } from "@/components/marketing/motion";
import { Button } from "@/components/ui/button";
import styles from "@/components/marketing/marketing-site.module.css";

type SolutionDetailPageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return solutionPages.map((solution) => ({
    slug: solution.slug,
  }));
}

export async function generateMetadata({ params }: SolutionDetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  const solution = getSolutionPage(slug);

  if (!solution) {
    return {
      title: "Solution",
    };
  }

  return {
    title: solution.title,
    description: `${solution.headline} See how ${PLATFORM_BRAND_NAME} fits ${solution.title.toLowerCase()} teams and business owners.`,
  };
}

export default async function SolutionDetailPage({ params }: SolutionDetailPageProps) {
  const { slug } = await params;
  const solution = getSolutionPage(slug);

  if (!solution) {
    notFound();
  }

  const Icon = solution.icon;
  const relatedSolutions = solutionPages.filter((entry) => entry.slug !== solution.slug).slice(0, 3);

  return (
    <MarketingSubpageShell
      eyebrow={solution.eyebrow}
      title={solution.headline}
      description={solution.summary}
      pills={solution.fitSignals}
      panelTitle="Why owners buy this"
      panelBody={solution.audience}
      panelLinks={[
        { label: "All solutions", href: "/home/solutions" },
        { label: "Book a demo", href: "/home/book-demo" },
      ]}
    >
      <section className="grid gap-12 lg:grid-cols-[0.88fr_1.12fr] lg:items-start">
        <div className="space-y-5">
          <Reveal>
            <div className="flex size-12 items-center justify-center rounded-full bg-[#0f1f55] text-white">
              <Icon className="size-5" />
            </div>
          </Reveal>
          <Reveal delay={0.05}>
            <p className={styles.stripeEyebrow}>Where the pressure shows up</p>
          </Reveal>
          <Reveal delay={0.1}>
            <h2 className="max-w-3xl text-[clamp(2.05rem,4vw,3.95rem)] font-semibold leading-[0.98] tracking-[-0.05em] text-[#0b1945] text-balance">
              The business case is usually obvious long before the software decision is.
            </h2>
          </Reveal>
          <Reveal delay={0.15}>
            <p className="max-w-2xl text-base leading-8 text-[#2d3d66]/82">
              This is what usually pushes teams to look for a better operating system in {solution.title.toLowerCase()}.
            </p>
          </Reveal>
        </div>

        <StaggerChildren staggerDelay={0.1} className="grid gap-4 md:grid-cols-3">
          {solution.pains.map((pain, index) => (
            <StaggerItem key={pain}>
              <article
                className={`${styles.productControlCard} transition-transform duration-200 hover:-translate-y-1 hover:shadow-[0_24px_56px_rgba(29,39,79,0.1)]`}
              >
                <p className={styles.productFeatureEyebrow}>Pressure point 0{index + 1}</p>
                <p className="mt-3 text-sm leading-7 text-[#31436f]/84">{pain}</p>
              </article>
            </StaggerItem>
          ))}
        </StaggerChildren>
      </section>

      <section className="mt-18 grid gap-10 lg:grid-cols-[0.76fr_1.24fr] lg:items-start">
        <div className="space-y-4">
          <Reveal>
            <p className={styles.stripeEyebrow}>What Corelith covers</p>
          </Reveal>
          <Reveal delay={0.05}>
            <h3 className="max-w-xl text-[clamp(1.95rem,3.6vw,3.2rem)] font-semibold leading-[0.98] tracking-[-0.05em] text-[#0b1945] text-balance">
              The solution is designed around the work your team already has to do.
            </h3>
          </Reveal>
        </div>

        <StaggerChildren staggerDelay={0.08} className="grid gap-4 md:grid-cols-2">
          {solution.capabilities.map((capability) => (
            <StaggerItem key={capability.title}>
              <article
                className={`${styles.productFeatureCard} transition-transform duration-200 hover:-translate-y-1 hover:shadow-[0_24px_56px_rgba(29,39,79,0.1)]`}
              >
                <p className={styles.productFeatureEyebrow}>{capability.title}</p>
                <p className="mt-3 text-sm leading-7 text-[#31436f]/84">{capability.copy}</p>
              </article>
            </StaggerItem>
          ))}
        </StaggerChildren>
      </section>

      <section className="mt-18 grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
        <div className="space-y-4">
          <Reveal>
            <p className={styles.stripeEyebrow}>What owners get back</p>
          </Reveal>
          <Reveal delay={0.05}>
            <h3 className="max-w-xl text-[clamp(1.95rem,3.6vw,3.15rem)] font-semibold leading-[0.98] tracking-[-0.05em] text-[#0b1945] text-balance">
              Better visibility, better follow-through, and less time spent rebuilding context.
            </h3>
          </Reveal>
        </div>

        <StaggerChildren staggerDelay={0.1} className="grid gap-4 md:grid-cols-3">
          {solution.outcomes.map((outcome) => (
            <StaggerItem key={outcome}>
              <article className={styles.productProofCard}>
                <p className={styles.productFeatureEyebrow}>Outcome</p>
                <p className="mt-3 text-[1.04rem] font-semibold leading-[1.35] tracking-[-0.03em] text-[#0f1f55]">{outcome}</p>
              </article>
            </StaggerItem>
          ))}
        </StaggerChildren>
      </section>

      <section className="mt-18 grid gap-10 lg:grid-cols-[0.78fr_1.22fr] lg:items-start">
        <div className="space-y-4">
          <Reveal>
            <p className={styles.stripeEyebrow}>How rollout usually starts</p>
          </Reveal>
          <Reveal delay={0.05}>
            <h3 className="max-w-xl text-[clamp(1.95rem,3.4vw,3.05rem)] font-semibold leading-[0.98] tracking-[-0.05em] text-[#0b1945] text-balance">
              Start with the part of the workflow that is already costing you the most.
            </h3>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="max-w-xl text-base leading-8 text-[#2d3d66]/82">
              The best rollout order is usually obvious to the business. Start there, prove it, then add the next layer.
            </p>
          </Reveal>
        </div>

        <Reveal delay={0.15}>
          <div className={styles.productMatrix}>
            <div className={styles.productMatrixHead}>
              <p className={styles.productMatrixEyebrow}>Rollout map</p>
              <p className={styles.productMatrixTitle}>Build the solution in the order the business needs.</p>
            </div>
            <div className="grid gap-4 p-5">
              <div className={styles.solutionPathCard}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#7383a9]">Start with</p>
                <p className="mt-2 text-sm leading-7 text-[#31436f]/84">{solution.startWith}</p>
              </div>
              <div className={styles.solutionPathCard}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#7383a9]">Expand with</p>
                <p className="mt-2 text-sm leading-7 text-[#31436f]/84">{solution.expandWith}</p>
              </div>
              <div className={styles.solutionPathCard}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#7383a9]">Modules in play</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {solution.modules.map((module) => (
                    <span key={module} className={styles.productChip}>
                      {module}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      <section className="mt-18 grid gap-10 lg:grid-cols-[0.78fr_1.22fr] lg:items-start">
        <div className="space-y-4">
          <Reveal>
            <p className={styles.stripeEyebrow}>Pricing hint</p>
          </Reveal>
          <Reveal delay={0.05}>
            <h3 className="max-w-xl text-[clamp(1.9rem,3.3vw,2.9rem)] font-semibold leading-[0.98] tracking-[-0.05em] text-[#0b1945] text-balance">
              Most {solution.title.toLowerCase()} customers start here.
            </h3>
          </Reveal>
        </div>

        <Reveal delay={0.1}>
          <div className={styles.pricingHintBox}>
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-[#0f1f55] px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-white">
                {solution.recommendedTier}
              </span>
              <span className="text-sm text-[#31436f]/90">
                Recommended tier
              </span>
            </div>
            <p className="mt-3 text-sm leading-7 text-[#31436f]/90">
              Teams in {solution.title.toLowerCase()} typically begin on the <strong>{solution.recommendedTier}</strong> tier
              with the following add-ons: {solution.defaultAddOns.map((a) => a.replace(/_/g, " ").replace(/ADDON /, "")).join(", ")}.
              You can adjust sites and add-ons in the pricing calculator to match your exact footprint.
            </p>
            <div className="mt-4">
              <Button asChild variant="outline" className="rounded-full border-[#d6def5] bg-white text-[#0b1945] hover:bg-[#f6f8ff]">
                <Link href="/home/pricing">Build your estimate</Link>
              </Button>
            </div>
          </div>
        </Reveal>
      </section>

      <section className="mt-18 grid gap-10 lg:grid-cols-[0.78fr_1.22fr] lg:items-start">
        <div className="space-y-4">
          <Reveal>
            <p className={styles.stripeEyebrow}>Explore more</p>
          </Reveal>
          <Reveal delay={0.05}>
            <h3 className="max-w-xl text-[clamp(1.9rem,3.3vw,2.9rem)] font-semibold leading-[0.98] tracking-[-0.05em] text-[#0b1945] text-balance">
              One product base. More than one solution story.
            </h3>
          </Reveal>
        </div>

        <StaggerChildren staggerDelay={0.1} className="grid gap-4 md:grid-cols-3">
          {relatedSolutions.map((related) => (
            <StaggerItem key={related.slug}>
              <Link
                href={`/home/solutions/${related.slug}`}
                className={`${styles.productFeatureCard} group block transition-transform duration-200 hover:-translate-y-1 hover:shadow-[0_24px_56px_rgba(29,39,79,0.1)]`}
              >
                <p className={styles.productFeatureEyebrow}>{related.eyebrow}</p>
                <p className="mt-2 text-[1.02rem] font-semibold leading-[1.28] tracking-[-0.03em] text-[#0f1f55]">{related.title}</p>
                <p className="mt-3 text-sm leading-7 text-[#31436f]/84">{related.summary}</p>
                <span className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-[#0f1f55]">
                  View solution
                  <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-1" />
                </span>
              </Link>
            </StaggerItem>
          ))}
        </StaggerChildren>
      </section>

      <section className={`mt-18 ${styles.ctaWrap} px-6 py-10 text-white lg:px-10`}>
        <div className="grid gap-8 lg:grid-cols-[0.88fr_1.12fr] lg:items-end">
          <div className="space-y-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/62">Next step</p>
            <h3 className="max-w-2xl text-[clamp(2rem,3.7vw,3.25rem)] font-semibold leading-[1.02] tracking-[-0.045em] text-balance">
              Book a demo built around your {solution.title.toLowerCase()} workflow.
            </h3>
            <p className="max-w-2xl text-sm leading-7 text-white/74">
              We will show you how the shared product base works, how this solution fits your business case, and what
              the first rollout step could be.
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
              <Link href="/home/solutions">All solutions</Link>
            </Button>
          </div>
        </div>
      </section>
    </MarketingSubpageShell>
  );
}
