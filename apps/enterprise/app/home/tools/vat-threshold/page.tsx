import type { Metadata } from "next";
import Link from "next/link";

import { VatThresholdChecker } from "@/app/home/tools/vat-threshold/vat-checker";
import {
  CtaBand,
  JsonLd,
  PageHero,
  SectionIntro,
  SiteChrome,
} from "@/app/home/site-components";
import { FDMS_STATUS_COPY, FDMS_STATUS_HEADLINE, seoPages, whatsappHref } from "@/app/home/site-data";
import styles from "@/app/home/marketing.module.css";
import {
  PENALTY_CAP_DAYS,
  PENALTY_USD_PER_TILL_PER_DAY,
  VAT_REGISTRATION_WINDOW_DAYS,
  VAT_STANDARD_RATE,
  VAT_THRESHOLD_EFFECTIVE_FROM,
  VAT_THRESHOLD_USD,
  VAT_THRESHOLD_WINDOW_MONTHS,
} from "@/lib/marketing/penalty";
import { ENTRY_TIER, formatUsd, getMarketingTier } from "@/lib/marketing/pricing";
import {
  breadcrumbJsonLd,
  buildMarketingMetadata,
  faqJsonLd,
  serviceJsonLd,
} from "@/lib/marketing/seo";
import { ArrowRight, ExternalLink, Info } from "@corelithzw/ui/lib/icons";

export const metadata: Metadata = buildMarketingMetadata(seoPages.vatThreshold);

const fiscalTier = getMarketingTier("FISCAL") ?? ENTRY_TIER;

const VAT_PERCENT = Math.round(VAT_STANDARD_RATE * 100);

const toolFaqs = [
  {
    q: "What is the VAT registration threshold in Zimbabwe?",
    a: `${formatUsd(VAT_THRESHOLD_USD)} — or the ZWG equivalent — in taxable supplies over any ${VAT_THRESHOLD_WINDOW_MONTHS}-month period, with effect from ${VAT_THRESHOLD_EFFECTIVE_FROM}. It was US$40,000 before that, which is why older guidance you may be holding is wrong.`,
  },
  {
    q: "Is it a tax year or a rolling period?",
    a: `Rolling. The test is taxable supplies that exceed, or are expected to exceed, ${formatUsd(VAT_THRESHOLD_USD)} within any ${VAT_THRESHOLD_WINDOW_MONTHS} months — so a strong second half can put you over it without the calendar year closing.`,
  },
  {
    q: "Which sales count towards it?",
    a: "Standard-rated and zero-rated supplies both count. Exempt supplies do not, and neither do occasional private sales or hobby income. If a large share of your turnover is exempt, take the split to your accountant before relying on any single number.",
  },
  {
    q: "What happens if I should have registered and did not?",
    a: "The Commissioner General may register you compulsorily, and you become liable for the VAT that should have been charged, plus interest and penalties, on the turnover already made. Registering late is more expensive than registering early.",
  },
  {
    q: "What does registering actually oblige me to do?",
    a: `Charge VAT at ${VAT_PERCENT}% on taxable supplies, file returns, keep the records that support them, and issue fiscal receipts through a registered fiscal device. Failing that last one carries its own civil penalty of ${formatUsd(PENALTY_USD_PER_TILL_PER_DAY)} per point of sale per day, capped at ${PENALTY_CAP_DAYS} days.`,
  },
];

export default function VatThresholdPage() {
  return (
    <SiteChrome>
      <JsonLd
        data={[
          serviceJsonLd({
            name: "VAT registration threshold checker",
            description: seoPages.vatThreshold.description,
            path: seoPages.vatThreshold.path,
            serviceType: "Tax compliance calculator",
            keywords: seoPages.vatThreshold.keywords,
          }),
          faqJsonLd(toolFaqs),
          breadcrumbJsonLd([
            { name: "Home", path: "/home" },
            { name: "Free tools", path: "/home/tools" },
            { name: "VAT registration threshold checker", path: seoPages.vatThreshold.path },
          ]),
        ]}
      />

      <PageHero
        eyebrow="Free tool"
        title="Do you have to register for VAT?"
        copy={`Registration is compulsory once taxable supplies exceed ${formatUsd(VAT_THRESHOLD_USD)} in any ${VAT_THRESHOLD_WINDOW_MONTHS} months — a figure that dropped from US$40,000 on ${VAT_THRESHOLD_EFFECTIVE_FROM} and caught a lot of businesses that had checked once and stopped checking. Put your turnover in.`}
      >
        <div className={styles.assuranceGrid}>
          <span>No sign-up, no email</span>
          <span>Rolling {VAT_THRESHOLD_WINDOW_MONTHS}-month test</span>
          <span>Current threshold: {formatUsd(VAT_THRESHOLD_USD)}</span>
        </div>
      </PageHero>

      <section className={styles.section}>
        <VatThresholdChecker />
      </section>

      <section className={styles.band}>
        <div className={styles.section}>
          <SectionIntro
            eyebrow="What follows registration"
            title="Registering for VAT is also how you end up owing fiscalisation."
            copy={`A VAT-registered operator has to issue fiscal receipts from a registered device. That is the obligation most businesses discover second, after they have already crossed the threshold, and it is the one with a ${formatUsd(PENALTY_USD_PER_TILL_PER_DAY)}-a-day price on it.`}
          />
          <div className={styles.cardGrid2}>
            <article className={styles.card}>
              <h2 className={styles.cardTitle}>Notify within {VAT_REGISTRATION_WINDOW_DAYS} days</h2>
              <p className={styles.body}>
                The obligation starts when your supplies exceed the threshold or you expect them to,
                not when you get around to the paperwork. Registering on time is the cheapest version
                of this; being registered compulsorily after the fact is the expensive one.
              </p>
            </article>
            <article className={styles.card}>
              <h2 className={styles.cardTitle}>Then every receipt has to be fiscal</h2>
              <p className={styles.body}>
                Charging {VAT_PERCENT}% is the easy half. Issuing receipts through a registered
                fiscal device, keeping the counters straight across tills, and handling refunds
                against the original receipt is the half that fails quietly for months.
              </p>
              <Link href="/home/tools/fiscalisation-penalty" className={styles.inlineAction}>
                What that costs per day
                <ArrowRight className={styles.icon} weight="regular" />
              </Link>
            </article>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <SectionIntro eyebrow="Questions" title="The threshold, in the detail that decides it." />
        <div className={styles.faqList}>
          {toolFaqs.map((item) => (
            <article key={item.q} className={styles.compactCard}>
              <h3 className={styles.cardTitle}>{item.q}</h3>
              <p className={styles.body}>{item.a}</p>
            </article>
          ))}
        </div>

        <div className={`${styles.notePanel} ${styles.sectionFooter}`}>
          <p className={styles.eyebrow}>
            <Info className={styles.icon} weight="regular" /> About the product behind the tool
          </p>
          <h3 className={styles.cardTitle}>{FDMS_STATUS_HEADLINE}</h3>
          <p className={styles.body}>{FDMS_STATUS_COPY}</p>
          <Link href="/home/pricing" className={styles.inlineAction}>
            {fiscalTier.name} from {formatUsd(fiscalTier.annualMonthlyPrice)} a month
            <ArrowRight className={styles.icon} weight="regular" />
          </Link>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.ctaPanel}>
          <p className={styles.eyebrow}>Get ahead of it</p>
          <h2 className={styles.sectionTitle}>Crossing the threshold should be a good month, not a crisis.</h2>
          <p className={styles.lead}>
            Tell us your turnover and how many tills you run. We will tell you what registering
            means for your invoicing, and what it costs to have the receipts right from day one.
          </p>
          <div className={styles.buttonRow}>
            <a
              href={whatsappHref(
                "Hi Corelith. I used your VAT threshold checker and I want to understand what registering means for my invoicing.",
              )}
              className={styles.button}
              target="_blank"
              rel="noreferrer"
            >
              Message us on WhatsApp
              <ExternalLink className={styles.icon} weight="regular" />
            </a>
            <Link
              href="/home/tools/fiscalisation-penalty"
              className={`${styles.button} ${styles.buttonQuiet}`}
            >
              Fiscalisation penalty calculator
              <ArrowRight className={styles.icon} weight="regular" />
            </Link>
          </div>
        </div>
      </section>

      <CtaBand
        eyebrow="Next step"
        title="Registered for VAT? The receipts are the next problem."
        copy={`${fiscalTier.name} covers ZIMRA fiscalisation from ${formatUsd(fiscalTier.annualMonthlyPrice)} a month billed annually, across as many tills as you run.`}
      />
    </SiteChrome>
  );
}
