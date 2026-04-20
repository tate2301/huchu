import Link from "next/link";

import { ArrowRight } from "@/lib/icons";
import { PLATFORM_BRAND_NAME } from "@/lib/platform/brand";
import { MarketingSubpageShell } from "@/components/marketing/marketing-subpage-shell";
import { Reveal, StaggerChildren, StaggerItem } from "@/components/marketing/motion";
import { Button } from "@/components/ui/button";
import styles from "@/components/marketing/marketing-site.module.css";

export default function AboutPage() {
  return (
    <MarketingSubpageShell
      eyebrow="About Pagka"
      title="We build software that keeps Zimbabwe businesses moving."
      description="Pagka is a Zimbabwean software company. We make Huchu — an operations platform for businesses that need to track stock, sales, people, and money across one or many sites."
      pills={["Zimbabwe-built", "Offline-first", "SMB-focused"]}
      panelTitle="What we believe"
      panelBody="Software should work where you work, cost what you can afford, and keep a clear record of what happened so you can make better decisions."
      panelLinks={[
        { label: "Contact us", href: "/home/contact" },
        { label: "Book a demo", href: "/home/book-demo" },
      ]}
    >
      <section className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
        <div className="space-y-5">
          <Reveal>
            <p className={styles.stripeEyebrow}>Why we started</p>
          </Reveal>
          <Reveal delay={0.05}>
            <h2 className="max-w-3xl text-[clamp(2.05rem,4vw,3.95rem)] font-semibold leading-[0.98] tracking-[-0.05em] text-[#0b1945] text-balance">
              We got tired of watching good businesses lose money to bad systems.
            </h2>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="max-w-2xl text-base leading-8 text-[#2d3d66]/82">
              Zimbabwe businesses are some of the most resilient in the world. They operate through power cuts,
              network failures, cash shortages, and policy shifts. But their tools don't match their resilience.
              Most still run on notebooks, WhatsApp groups, and memory.
            </p>
          </Reveal>
          <Reveal delay={0.15}>
            <p className="max-w-2xl text-base leading-8 text-[#2d3d66]/82">
              We built Huchu to change that. Not an over-engineered ERP that takes six months to configure.
              Something you can set up in an afternoon, use offline when the internet drops, and grow into
              as your business expands.
            </p>
          </Reveal>
        </div>

        <StaggerChildren staggerDelay={0.1} className="grid gap-4 md:grid-cols-2">
          {[
            { title: "Built here", copy: "Designed and developed in Zimbabwe for Zimbabwean realities. We know the context because we live it." },
            { title: "Fair pricing", copy: "No enterprise lock-in, no hidden fees. Starter plans from $39/month. Add what you need, when you need it." },
            { title: "Offline first", copy: "Works without internet. Syncs when you're back online. Because that's how Zimbabwe actually works." },
            { title: "Clear records", copy: "Every transaction logged. Every change tracked. No more arguing about what happened last Tuesday." },
          ].map((item) => (
            <StaggerItem key={item.title}>
              <article className={styles.productFeatureCard}>
                <p className={styles.productFeatureEyebrow}>{item.title}</p>
                <p className="mt-3 text-sm leading-7 text-[#31436f]/84">{item.copy}</p>
              </article>
            </StaggerItem>
          ))}
        </StaggerChildren>
      </section>

      <section className="mt-18 grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
        <div className="space-y-4">
          <Reveal>
            <p className={styles.stripeEyebrow}>The team</p>
          </Reveal>
          <Reveal delay={0.05}>
            <h3 className="max-w-xl text-[clamp(1.95rem,3.6vw,3.15rem)] font-semibold leading-[0.98] tracking-[-0.05em] text-[#0b1945] text-balance">
              Small team, big mission.
            </h3>
          </Reveal>
        </div>

        <StaggerChildren staggerDelay={0.1} className="grid gap-4 md:grid-cols-3">
          {[
            { name: "Tate", role: "Founder & Engineer", bio: "Built the first version of Huchu after watching a family business struggle with stock tracking. Still writes code every day." },
            { name: "You?", role: "Join the team", bio: "We're hiring engineers and customer success people who care about Zimbabwean businesses." },
          ].map((person) => (
            <StaggerItem key={person.name}>
              <article className={styles.productProofCard}>
                <p className={styles.productFeatureEyebrow}>{person.role}</p>
                <p className="mt-2 text-[1.04rem] font-semibold leading-[1.35] tracking-[-0.03em] text-[#0f1f55]">{person.name}</p>
                <p className="mt-3 text-sm leading-7 text-[#31436f]/84">{person.bio}</p>
              </article>
            </StaggerItem>
          ))}
        </StaggerChildren>
      </section>

      <section className="mt-18 grid gap-10 lg:grid-cols-[0.78fr_1.22fr] lg:items-start">
        <div className="space-y-4">
          <Reveal>
            <p className={styles.stripeEyebrow}>Where we're going</p>
          </Reveal>
          <Reveal delay={0.05}>
            <h3 className="max-w-xl text-[clamp(1.95rem,3.4vw,3.05rem)] font-semibold leading-[0.98] tracking-[-0.05em] text-[#0b1945] text-balance">
              Every Zimbabwe business deserves software that works as hard as they do.
            </h3>
          </Reveal>
        </div>

        <Reveal delay={0.1}>
          <div className={styles.productMatrix}>
            <div className={styles.productMatrixHead}>
              <p className={styles.productMatrixEyebrow}>2026 & beyond</p>
              <p className={styles.productMatrixTitle}>The roadmap is simple: more businesses, more verticals, more value.</p>
            </div>
            <div className="grid gap-4 p-5">
              {[
                { label: "More verticals", value: "Agriculture, health, logistics — any business that needs to track operations." },
                { label: "Mobile apps", value: "Native iOS and Android apps for field teams and remote sites." },
                { label: "Payments", value: "Integrated mobile money and banking for smoother cash flow." },
                { label: "AI features", value: "Smart forecasting and anomaly detection for stock and sales." },
              ].map((item) => (
                <div key={item.label} className={styles.solutionPathCard}>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#7383a9]">{item.label}</p>
                  <p className="mt-2 text-sm leading-7 text-[#31436f]/84">{item.value}</p>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </section>

      <section className={`mt-18 ${styles.ctaWrap} px-6 py-10 text-white lg:px-10`}>
        <div className="grid gap-8 lg:grid-cols-[0.88fr_1.12fr] lg:items-end">
          <div className="space-y-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/62">Join us</p>
            <h3 className="max-w-2xl text-[clamp(2rem,3.7vw,3.25rem)] font-semibold leading-[1.02] tracking-[-0.045em] text-balance">
              Want to build software that matters?
            </h3>
            <p className="max-w-2xl text-sm leading-7 text-white/74">
              We're always looking for people who care about Zimbabwean businesses and want to build tools that make a real difference.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <Button asChild size="lg" className="rounded-full bg-white text-[#091127] hover:bg-white/92 hover:text-[#091127]">
              <Link href="/home/contact">
                Get in touch
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="rounded-full border-white/18 bg-transparent text-white hover:bg-white/10 hover:text-white"
            >
              <Link href="/home/book-demo">Book a demo</Link>
            </Button>
          </div>
        </div>
      </section>
    </MarketingSubpageShell>
  );
}
