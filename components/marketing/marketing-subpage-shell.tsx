import Link from "next/link";

import { ArrowRight } from "@/lib/icons";
import { PLATFORM_BRAND_INITIAL, PLATFORM_BRAND_NAME } from "@/lib/platform/brand";
import { marketingNavItems, marketingSiteHighlights } from "@/components/marketing/marketing-data";
import { Button } from "@/components/ui/button";
import styles from "@/components/marketing/marketing-site.module.css";

type MarketingSubpageLink = {
  label: string;
  href: string;
};

type MarketingSubpageShellProps = {
  title: string;
  description?: string;
  eyebrow?: string;
  pills?: string[];
  panelTitle?: string;
  panelBody?: string;
  panelLinks?: MarketingSubpageLink[];
  children: React.ReactNode;
};

export function MarketingSubpageShell({
  title,
  description,
  eyebrow = "Overview",
  pills = marketingSiteHighlights,
  panelTitle = "What this page helps you answer",
  panelBody = "See how the product fits, where it applies, and what to explore next before you book a demo.",
  panelLinks,
  children,
}: MarketingSubpageShellProps) {
  const contextualLinks = panelLinks ?? [
    { label: "Product", href: "/home/product" },
    { label: "Solutions", href: "/home/solutions" },
    { label: "Book a demo", href: "/home/book-demo" },
  ];

  return (
    <div className="min-h-screen overflow-x-clip bg-[linear-gradient(180deg,#0d1738_0_23rem,#f7f9ff_23rem_100%)] text-white">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[rgba(9,14,32,0.84)] backdrop-blur-2xl">
        <div className="mx-auto flex max-w-7xl items-center gap-6 px-6 py-4 lg:px-8">
          <Link href="/home" className="flex items-center gap-3 text-sm font-semibold text-white">
            <span className="flex size-10 items-center justify-center rounded-2xl border border-white/10 bg-white/8 text-[11px] uppercase tracking-[0.22em]">
              {PLATFORM_BRAND_INITIAL}
            </span>
            {PLATFORM_BRAND_NAME}
          </Link>
          <nav className="hidden flex-1 items-center gap-8 text-sm text-white/72 lg:flex">
            {marketingNavItems.map((item) => (
              <Link key={item.href} href={item.href} className="transition-colors hover:text-white">
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <Button variant="ghost" asChild className="hidden text-white hover:bg-white/10 hover:text-white sm:inline-flex">
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

      <section className="mx-auto max-w-7xl px-6 pb-12 pt-16 lg:px-8 lg:pt-20">
        <div className="grid gap-8 lg:grid-cols-[1.08fr_0.92fr] lg:items-end">
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-white/58">
              <span>{PLATFORM_BRAND_NAME}</span>
              <span className="h-px w-8 bg-white/20" aria-hidden="true" />
              <span>{eyebrow}</span>
            </div>
            <h1 className="max-w-4xl text-[clamp(2.7rem,5.2vw,4.9rem)] font-semibold leading-[0.95] tracking-[-0.055em] text-balance text-white">
              {title}
            </h1>
            {description ? (
              <p className="max-w-3xl text-base leading-8 text-white/74 lg:text-lg lg:leading-8">
                {description}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2.5">
              {pills.map((item) => (
                <span key={item} className={styles.shellPill}>
                  {item}
                </span>
              ))}
            </div>
          </div>

          <aside className={styles.shellRail}>
            <div className={styles.shellCard}>
              <p className={styles.shellEyebrow}>Navigation</p>
              <div className="grid gap-2">
                {marketingNavItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/76 transition-colors hover:border-white/18 hover:bg-white/8 hover:text-white"
                  >
                    <span>{item.label}</span>
                    <ArrowRight className="size-4 opacity-70" />
                  </Link>
                ))}
              </div>
            </div>
            <div className={styles.shellCardAlt}>
              <p className={styles.shellEyebrowAlt}>{panelTitle}</p>
              <p className="text-sm leading-7 text-white/72">
                {panelBody}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {contextualLinks.map((link) => (
                  <Link key={link.href} href={link.href} className={styles.shellMicroLink}>
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>
          </aside>
        </div>

        <div className="mt-8 flex flex-wrap gap-3 border-t border-white/10 pt-4 text-sm text-white/70">
          <Link href="/home" className="transition-colors hover:text-white">
            Overview
          </Link>
          <Link href="/home/product" className="transition-colors hover:text-white">
            Product
          </Link>
          <Link href="/home/solutions" className="transition-colors hover:text-white">
            Solutions
          </Link>
          <Link href="/home/pricing" className="transition-colors hover:text-white">
            Pricing
          </Link>
          <Link href="/home/book-demo" className="transition-colors hover:text-white">
            Book a demo
          </Link>
        </div>
      </section>

      <main className="mx-auto max-w-7xl px-6 pb-18 lg:px-8 lg:pb-24">
        {children}
      </main>
    </div>
  );
}
