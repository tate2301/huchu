import Link from "next/link";

import { ArrowRight } from "@/lib/icons";
import { PLATFORM_BRAND_INITIAL, PLATFORM_BRAND_NAME } from "@/lib/platform/brand";
import { marketingNavItems } from "@/components/marketing/marketing-data";
import styles from "@/components/marketing/marketing-site.module.css";

type MarketingSubpageShellProps = {
  title: string;
  description?: string;
  pageName?: string;
  pills?: string[];
  children: React.ReactNode;
};

export function MarketingSubpageShell({ title, description, pageName, pills, children }: MarketingSubpageShellProps) {
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
            <Link href="/home/book-demo" className={styles.navCta}>
              Book a demo
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* Page hero */}
      <div className={styles.subpageHero}>
        <div className={styles.subpageHeroGlow} aria-hidden="true" />
        <div className={styles.subpageHeroInner}>
          {/* Breadcrumb */}
          <div className={styles.subpageBreadcrumb}>
            <span>{PLATFORM_BRAND_NAME}</span>
            <span className={styles.subpageBreadcrumbSep} aria-hidden="true" />
            <span>{pageName ?? title.split(".")[0].trim()}</span>
          </div>

          {/* Title */}
          <h1 className={styles.subpageTitle}>{title}</h1>

          {/* Optional description */}
          {description && (
            <p className={styles.subpageSubtext}>{description}</p>
          )}

          {/* Optional pills */}
          {pills && pills.length > 0 && (
            <div className={styles.subpagePills}>
              {pills.map((pill) => (
                <span key={pill} className={`${styles.badgePill} ${styles.badgePillDark}`}>
                  {pill}
                </span>
              ))}
            </div>
          )}

          {/* Sub-navigation */}
          <nav className={styles.subpageNav} aria-label="Section navigation">
            <Link href="/home" className={styles.subpageNavLink}>Overview</Link>
            <Link href="/home/product" className={styles.subpageNavLink}>Product</Link>
            <Link href="/home/solutions" className={styles.subpageNavLink}>Solutions</Link>
            <Link href="/home/pricing" className={styles.subpageNavLink}>Pricing</Link>
            <Link href="/home/book-demo" className={styles.subpageNavLink}>Book a demo</Link>
          </nav>
        </div>
      </div>

      {/* Main content */}
      <main className={styles.subpageMain}>
        <div className={styles.subpageMainInner}>
          {children}
        </div>
      </main>
    </div>
  );
}
