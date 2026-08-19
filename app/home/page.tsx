import type { Metadata } from "next";
import Link from "next/link";

import { ProductPreview } from "@/app/home/product-preview";
import {
  Announcement,
  CompetitiveEdgeGrid,
  CtaBand,
  DifferentiatorSection,
  FaqSection,
  JsonLd,
  LaunchSprintSection,
  ModulesSection,
  MoneyLeakSection,
  MoneyTrailSection,
  PricingPreviewSection,
  ProblemSection,
  ProofSection,
  SectionIntro,
  SegmentSection,
  SiteChrome,
  TrustStrip,
} from "@/app/home/site-components";
import {
  FDMS_STATUS_COPY,
  FDMS_STATUS_HEADLINE,
  faqs,
  fiscalHero,
  fiscalWedge,
  freeTools,
  seoPages,
  whatsappHref,
} from "@/app/home/site-data";
import styles from "@/app/home/marketing.module.css";
import { ENTRY_TIER, MONEY_BACK_DAYS, formatUsd, getMarketingTier } from "@/lib/marketing/pricing";
import {
  breadcrumbJsonLd,
  buildMarketingMetadata,
  faqJsonLd,
  organizationJsonLd,
  softwareApplicationJsonLd,
  websiteJsonLd,
} from "@/lib/marketing/seo";
import { ArrowRight, ExternalLink, Info, ShieldCheck } from "@/lib/icons";

export const metadata: Metadata = buildMarketingMetadata(seoPages.home);

/** The fiscal SKU leads every price on this page. Read, never typed. */
const fiscalTier = getMarketingTier("FISCAL") ?? ENTRY_TIER;

/**
 * The landing page argues the compliance layer first (MK-1.1).
 *
 * A VAT-registered buyer is not shopping for business software; they are under
 * an obligation with a daily price on it. So the page names the regulation
 * before it names a benefit, and only then makes the second argument — that the
 * numbers on a fiscal invoice come from the POS, stock, books and payroll
 * underneath it, which is why buying the compliance layer alone is a worse deal
 * than buying the system that produces the figures.
 *
 *   what am I obliged to do          → hero, trust strip
 *   what does fiscalising here take  → the fiscal wedge, and where we honestly stand
 *   what is it costing me now        → the free tools
 *   where else is the money going    → the leaks, six trades, one problem
 *   why you cannot see it            → six versions of the truth
 *   what stops it                    → the trail
 *   is this me?                      → segment switcher
 *   what do I actually get           → modules
 *   why not the cheaper option       → comparison and differentiators
 *   will the rollout finish          → Launch Sprint
 *   what does it cost                → pricing preview, fiscal tier first
 *   why should I believe you         → honest proof framing
 *   what is still bothering me       → FAQ
 *   do the thing                     → CTA
 */
export default function HomePage() {
  return (
    <SiteChrome>
      <JsonLd
        data={[
          organizationJsonLd(),
          websiteJsonLd(),
          softwareApplicationJsonLd(),
          faqJsonLd(faqs.slice(0, 6)),
          breadcrumbJsonLd([{ name: "Home", path: "/home" }]),
        ]}
      />

      <Announcement />
      <div className={styles.heroBackdrop}>
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <span className={styles.eyebrowMark}>
              <ShieldCheck className={styles.icon} weight="regular" />
              {fiscalHero.eyebrow}
            </span>
            <h1 className={styles.display}>{fiscalHero.title}</h1>
            <p className={styles.lead}>{fiscalHero.lead}</p>
            <div className={styles.buttonRow}>
              <Link
                href={fiscalHero.primaryCtaHref}
                className={`${styles.button} ${styles.buttonPrimary}`}
              >
                {fiscalHero.primaryCtaLabel}
                <ArrowRight className={styles.icon} weight="regular" />
              </Link>
              <Link
                href={whatsappHref(fiscalHero.whatsappMessage)}
                className={styles.button}
                target="_blank"
                rel="noreferrer"
              >
                Ask us on WhatsApp
                <ExternalLink className={styles.icon} weight="regular" />
              </Link>
            </div>
            <div className={styles.assuranceGrid}>
              <span>
                {fiscalTier.name} from {formatUsd(fiscalTier.annualMonthlyPrice)}/month billed
                annually
              </span>
              <span>{formatUsd(fiscalTier.monthlyPrice)}/month month to month</span>
              <span>{MONEY_BACK_DAYS}-day money-back guarantee</span>
            </div>
          </div>
          <ProductPreview />
        </section>
      </div>
      <TrustStrip />

      <section className={`${styles.section} ${styles.reveal}`}>
        <SectionIntro
          eyebrow="The compliance layer"
          title="Fiscalising a real trading day is harder than fiscalising a demo."
          copy="Anyone can sign one receipt on a good line. What decides whether you stay compliant is what happens on the fourth till, on the day the fibre is cut, and on the refund somebody processes against a sale from last week."
        />
        <div className={styles.cardGrid2}>
          {fiscalWedge.map((item) => {
            const Icon = item.icon;

            return (
              <article key={item.title} className={styles.card}>
                <Icon className={styles.cardIcon} weight="regular" />
                <h3 className={styles.cardTitle}>{item.title}</h3>
                <p className={styles.body}>{item.copy}</p>
              </article>
            );
          })}
        </div>

        <div className={`${styles.notePanel} ${styles.sectionFooter}`}>
          <p className={styles.eyebrow}>
            <Info className={styles.icon} weight="regular" /> Where this actually stands
          </p>
          <h3 className={styles.cardTitle}>{FDMS_STATUS_HEADLINE}</h3>
          <p className={styles.body}>{FDMS_STATUS_COPY}</p>
        </div>
      </section>

      <div className={styles.band}>
        <section className={`${styles.section} ${styles.reveal}`}>
          <SectionIntro
            eyebrow="Free tools"
            title="Two numbers you can check before you talk to anyone."
            copy="No sign-up and no email gate. Both run the statutory arithmetic, both name the instrument they come from, and both are as useful to your accountant as they are to us."
          />
          <div className={styles.cardGrid2}>
            {freeTools.map((tool) => {
              const Icon = tool.icon;

              return (
                <article key={tool.slug} className={styles.card}>
                  <Icon className={styles.cardIcon} weight="regular" />
                  <h3 className={styles.cardTitle}>{tool.name}</h3>
                  <p className={styles.body}>{tool.summary}</p>
                  <Link href={tool.href} className={styles.inlineAction}>
                    Open the {tool.name.toLowerCase()}
                    <ArrowRight className={styles.icon} weight="regular" />
                  </Link>
                </article>
              );
            })}
          </div>
        </section>
      </div>

      <MoneyLeakSection />
      <ProblemSection />
      <MoneyTrailSection />
      <SegmentSection />
      <ModulesSection />
      <DifferentiatorSection />

      <section className={`${styles.section} ${styles.reveal}`}>
        <SectionIntro
          eyebrow="What actually makes the difference"
          title="Six things that decide whether this works here."
          copy="Not feature counts — nobody ever made money off a feature count. These are the conditions a system has to survive in this country, and the commercial terms that decide whether you can afford to put your whole team on it."
        />
        <CompetitiveEdgeGrid />
      </section>

      <div className={styles.bandSunken}>
        <LaunchSprintSection />
      </div>

      <PricingPreviewSection />
      <ProofSection />
      <FaqSection />
      <CtaBand
        eyebrow="Next step"
        title="Start with the obligation, then close the gaps behind it."
        copy={`Fiscalise your tills on ${fiscalTier.name} from ${formatUsd(fiscalTier.annualMonthlyPrice)} a month billed annually, and switch on stock, books and payroll when they pay for themselves. Tell us how many tills and sites you run and we will tell you what it costs.`}
      />
    </SiteChrome>
  );
}
