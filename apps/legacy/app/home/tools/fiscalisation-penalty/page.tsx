import type { Metadata } from "next";
import Link from "next/link";

import { PenaltyCalculator } from "@/app/home/tools/fiscalisation-penalty/penalty-calculator";
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
  PENALTY_AUTHORITY,
  PENALTY_CAP_DAYS,
  PENALTY_CRIMINAL_CONSEQUENCE,
  PENALTY_MAX_PER_TILL_USD,
  PENALTY_USD_PER_TILL_PER_DAY,
} from "@/lib/marketing/penalty";
import { ENTRY_TIER, formatUsd, getMarketingTier } from "@/lib/marketing/pricing";
import {
  breadcrumbJsonLd,
  buildMarketingMetadata,
  faqJsonLd,
  serviceJsonLd,
} from "@/lib/marketing/seo";
import { ArrowRight, ExternalLink, Info } from "@/lib/icons";

export const metadata: Metadata = buildMarketingMetadata(seoPages.penaltyCalculator);

const fiscalTier = getMarketingTier("FISCAL") ?? ENTRY_TIER;

/**
 * Questions an accountant asks of the tool itself. They are here rather than in
 * the shared FAQ because a free tool is only worth building if the person
 * checking it can find out where every figure came from without leaving the
 * page.
 */
const toolFaqs = [
  {
    q: "Where does the US$25 a day come from?",
    a: `${PENALTY_AUTHORITY}. It provides for a civil penalty of ${formatUsd(PENALTY_USD_PER_TILL_PER_DAY)} per point of sale for each day the operator remains in default.`,
  },
  {
    q: `Why does the number stop growing after ${PENALTY_CAP_DAYS} days?`,
    a: `Because the regulation caps the civil penalty at ${PENALTY_CAP_DAYS} days. Continuing in default beyond that is an offence rather than a running charge — on conviction, ${PENALTY_CRIMINAL_CONSEQUENCE}. A calculator that keeps multiplying past day ${PENALTY_CAP_DAYS} is printing a liability that does not exist.`,
  },
  {
    q: "Is this the whole exposure?",
    a: "No. This is the fiscalisation civil penalty only. Any VAT assessed, interest on unpaid tax, and penalties raised under other provisions are separate and are not modelled here. Treat the figure as an order of magnitude and take it to your tax adviser.",
  },
  {
    q: "Does registering a device now stop the clock?",
    a: "The penalty accrues for each day the operator remains in default, so it stops accruing when the default ends. It does not reverse the days already accrued. That is the argument for fiscalising this week rather than next quarter.",
  },
];

export default function FiscalisationPenaltyPage() {
  return (
    <SiteChrome>
      <JsonLd
        data={[
          serviceJsonLd({
            name: "Fiscalisation penalty calculator",
            description: seoPages.penaltyCalculator.description,
            path: seoPages.penaltyCalculator.path,
            serviceType: "Tax compliance calculator",
            keywords: seoPages.penaltyCalculator.keywords,
          }),
          faqJsonLd(toolFaqs),
          breadcrumbJsonLd([
            { name: "Home", path: "/home" },
            { name: "Free tools", path: "/home/tools" },
            { name: "Fiscalisation penalty calculator", path: seoPages.penaltyCalculator.path },
          ]),
        ]}
      />

      <PageHero
        eyebrow="Free tool"
        title="What is an unfiscalised till costing you a day?"
        copy={`${formatUsd(PENALTY_USD_PER_TILL_PER_DAY)} per point of sale, for every day you remain in default, up to ${PENALTY_CAP_DAYS} days — a maximum of ${formatUsd(PENALTY_MAX_PER_TILL_USD)} per till. Past that the liability stops being a fine and becomes a criminal offence. Put your own numbers in.`}
      >
        <div className={styles.assuranceGrid}>
          <span>No sign-up, no email</span>
          <span>{PENALTY_CAP_DAYS}-day cap applied</span>
          <span>Source named below</span>
        </div>
      </PageHero>

      <section className={styles.section}>
        <PenaltyCalculator />
      </section>

      <section className={styles.band}>
        <div className={styles.section}>
          <SectionIntro
            eyebrow="The rule"
            title={`The penalty is capped. What follows it is not a bigger invoice.`}
            copy={`${PENALTY_AUTHORITY} sets a civil penalty of ${formatUsd(PENALTY_USD_PER_TILL_PER_DAY)} per point of sale per day, not exceeding ${PENALTY_CAP_DAYS} days. An operator still in default after that is guilty of an offence and liable, on conviction, to ${PENALTY_CRIMINAL_CONSEQUENCE}.`}
          />
          <div className={styles.cardGrid2}>
            <article className={styles.card}>
              <h2 className={styles.cardTitle}>Why the cap matters to the number you were quoted</h2>
              <p className={styles.body}>
                Multiply {formatUsd(PENALTY_USD_PER_TILL_PER_DAY)} by four tills by two years and you
                get a figure north of seventy thousand dollars. Nobody is charged that, because the
                civil penalty stops at {PENALTY_CAP_DAYS} days. If a quote you have been given keeps
                multiplying, the arithmetic is wrong and so is the conclusion drawn from it.
              </p>
            </article>
            <article className={styles.card}>
              <h2 className={styles.cardTitle}>What the cap converts into</h2>
              <p className={styles.body}>
                Once the {PENALTY_CAP_DAYS} days are used up, the exposure moves from the company&rsquo;s
                bank account to a person&rsquo;s record: on conviction, {PENALTY_CRIMINAL_CONSEQUENCE}.
                That is a different kind of problem, and it is the reason the cap is not good news.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <SectionIntro
          eyebrow="Questions"
          title="Where every figure on this page comes from."
        />
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
          <p className={styles.eyebrow}>Stop the clock</p>
          <h2 className={styles.sectionTitle}>The penalty stops accruing the day the default ends.</h2>
          <p className={styles.lead}>
            Send us your till count and we will tell you what fiscalising them involves, what it
            costs and how long it takes. No form, no callback queue.
          </p>
          <div className={styles.buttonRow}>
            <a
              href={whatsappHref(
                "Hi Corelith. I used your fiscalisation penalty calculator and I need to get my tills fiscalised. What is involved?",
              )}
              className={styles.button}
              target="_blank"
              rel="noreferrer"
            >
              Message us on WhatsApp
              <ExternalLink className={styles.icon} weight="regular" />
            </a>
            <Link href="/home/tools/vat-threshold" className={`${styles.button} ${styles.buttonQuiet}`}>
              Check the VAT threshold too
              <ArrowRight className={styles.icon} weight="regular" />
            </Link>
          </div>
        </div>
      </section>

      <CtaBand
        eyebrow="Next step"
        title="Fiscalise the tills, then see the rest of the business."
        copy={`${fiscalTier.name} covers the obligation from ${formatUsd(fiscalTier.annualMonthlyPrice)} a month billed annually. Stock, books and payroll sit on the same record when you want them.`}
      />
    </SiteChrome>
  );
}
