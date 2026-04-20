import Link from "next/link";

import { ArrowRight } from "@/lib/icons";
import { PLATFORM_BRAND_NAME } from "@/lib/platform/brand";
import { MarketingSubpageShell } from "@/components/marketing/marketing-subpage-shell";
import { Reveal } from "@/components/marketing/motion";
import { Button } from "@/components/ui/button";
import styles from "@/components/marketing/marketing-site.module.css";

export default function ContactPage() {
  return (
    <MarketingSubpageShell
      eyebrow="Contact"
      title="Let's talk about your business."
      description="Whether you want a demo, have a question, or just want to see if Huchu fits your workflow — we're here."
      pills={["WhatsApp", "Email", "Demo"]}
      panelTitle="Quick contact"
      panelBody="Fastest way to reach us: WhatsApp. We respond within minutes during business hours."
      panelLinks={[
        { label: "Book a demo", href: "/home/book-demo" },
        { label: "FAQ", href: "/home/faq" },
      ]}
    >
      <section className="grid gap-12 lg:grid-cols-2 lg:items-start">
        <div className="space-y-8">
          <Reveal>
            <div className="space-y-4">
              <p className={styles.stripeEyebrow}>WhatsApp</p>
              <p className="text-2xl font-semibold text-[#0b1945]">+263 78 493 9111</p>
              <p className="text-sm leading-7 text-[#31436f]/84">
                Fastest response. Send us a message any time — we usually reply within minutes.
              </p>
              <Button asChild variant="outline" className="rounded-full border-[#d6def5] bg-white text-[#0b1945] hover:bg-[#f6f8ff]">
                <Link href="https://wa.me/263784939111" target="_blank" rel="noopener noreferrer">
                  Message on WhatsApp
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>
          </Reveal>

          <Reveal delay={0.1}>
            <div className="space-y-4">
              <p className={styles.stripeEyebrow}>Email</p>
              <p className="text-2xl font-semibold text-[#0b1945]">hello@pagka.dev</p>
              <p className="text-sm leading-7 text-[#31436f]/84">
                For detailed questions, proposals, or partnership inquiries.
              </p>
              <Button asChild variant="outline" className="rounded-full border-[#d6def5] bg-white text-[#0b1945] hover:bg-[#f6f8ff]">
                <Link href="mailto:hello@pagka.dev">
                  Send email
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>
          </Reveal>

          <Reveal delay={0.2}>
            <div className="space-y-4">
              <p className={styles.stripeEyebrow}>Book a demo</p>
              <p className="text-sm leading-7 text-[#31436f]/84">
                See Huchu in action. We'll walk through your workflow and show you exactly how it fits.
              </p>
              <Button asChild className="rounded-full bg-[#0f1f55] text-white hover:bg-[#1a2d6b]">
                <Link href="/home/book-demo">
                  Schedule a demo
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>
          </Reveal>
        </div>

        <Reveal delay={0.15}>
          <div className={styles.pricingHintBox}>
            <p className={styles.stripeEyebrow}>Send a message</p>
            <form className="mt-6 space-y-4">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-[#0b1945]">Name</label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  className="mt-1 block w-full rounded-lg border border-[#d6def5] bg-white px-4 py-3 text-sm text-[#0b1945] placeholder:text-[#8a8a8a] focus:border-[#0f1f55] focus:outline-none focus:ring-1 focus:ring-[#0f1f55]"
                  placeholder="Your name"
                />
              </div>
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-[#0b1945]">Email</label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  className="mt-1 block w-full rounded-lg border border-[#d6def5] bg-white px-4 py-3 text-sm text-[#0b1945] placeholder:text-[#8a8a8a] focus:border-[#0f1f55] focus:outline-none focus:ring-1 focus:ring-[#0f1f55]"
                  placeholder="you@business.co.zw"
                />
              </div>
              <div>
                <label htmlFor="business" className="block text-sm font-medium text-[#0b1945]">Business</label>
                <input
                  type="text"
                  id="business"
                  name="business"
                  className="mt-1 block w-full rounded-lg border border-[#d6def5] bg-white px-4 py-3 text-sm text-[#0b1945] placeholder:text-[#8a8a8a] focus:border-[#0f1f55] focus:outline-none focus:ring-1 focus:ring-[#0f1f55]"
                  placeholder="Your business name"
                />
              </div>
              <div>
                <label htmlFor="message" className="block text-sm font-medium text-[#0b1945]">Message</label>
                <textarea
                  id="message"
                  name="message"
                  rows={4}
                  className="mt-1 block w-full rounded-lg border border-[#d6def5] bg-white px-4 py-3 text-sm text-[#0b1945] placeholder:text-[#8a8a8a] focus:border-[#0f1f55] focus:outline-none focus:ring-1 focus:ring-[#0f1f55]"
                  placeholder="Tell us about your business and what you're looking for..."
                />
              </div>
              <Button type="submit" className="w-full rounded-full bg-[#0f1f55] text-white hover:bg-[#1a2d6b]">
                Send message
                <ArrowRight className="size-4" />
              </Button>
            </form>
          </div>
        </Reveal>
      </section>

      <section className={`mt-18 ${styles.ctaWrap} px-6 py-10 text-white lg:px-10`}>
        <div className="grid gap-8 lg:grid-cols-[0.88fr_1.12fr] lg:items-end">
          <div className="space-y-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/62">Free trial</p>
            <h3 className="max-w-2xl text-[clamp(2rem,3.7vw,3.25rem)] font-semibold leading-[1.02] tracking-[-0.045em] text-balance">
              Not sure yet? Try it free for 14 days.
            </h3>
            <p className="max-w-2xl text-sm leading-7 text-white/74">
              No credit card required. Set up in 5 minutes. Cancel anytime.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <Button asChild size="lg" className="rounded-full bg-white text-[#091127] hover:bg-white/92 hover:text-[#091127]">
              <Link href="/home/book-demo">
                Start free trial
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="rounded-full border-white/18 bg-transparent text-white hover:bg-white/10 hover:text-white"
            >
              <Link href="/home/pricing">View pricing</Link>
            </Button>
          </div>
        </div>
      </section>
    </MarketingSubpageShell>
  );
}
