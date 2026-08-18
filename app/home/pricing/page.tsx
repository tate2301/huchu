import type { Metadata } from "next";
import Link from "next/link";

import {
  AddOnTable,
  CtaBand,
  FaqSection,
  JsonLd,
  PageHero,
  PricingCards,
  SectionIntro,
  SiteChrome,
} from "@/app/home/site-components";
import { onboardingCovers, pricingPrinciples, seoPages } from "@/app/home/site-data";
import styles from "@/app/home/marketing.module.css";
import {
  ANNUAL_DISCOUNT_RATE,
  LAUNCH_SPRINT_DAYS,
  MARKETING_TIERS,
  MONEY_BACK_DAYS,
  SCHOOL_STARTING_TERM_PRICE,
  STARTING_MONTHLY_PRICE,
  TIER_COMPARISON_ROWS,
  USER_PACK_SIZE,
  formatUsd,
} from "@/lib/marketing/pricing";
import {
  breadcrumbJsonLd,
  buildMarketingMetadata,
  offerCatalogJsonLd,
} from "@/lib/marketing/seo";
import { ArrowRight, Check } from "@/lib/icons";

export const metadata: Metadata = buildMarketingMetadata(seoPages.pricing);

export default function PricingPage() {
  return (
    <SiteChrome>
      <JsonLd
        data={[
          offerCatalogJsonLd("/home/pricing"),
          breadcrumbJsonLd([
            { name: "Home", path: "/home" },
            { name: "Pricing", path: "/home/pricing" },
          ]),
        ]}
      />
      <PageHero
        eyebrow="Pricing"
        title="Priced per site. Never per user."
        copy={`From ${formatUsd(STARTING_MONTHLY_PRICE)} a month. Every cashier, clerk, technician and rep is included up to your seat ceiling, so putting your whole team on it costs you nothing extra. Setup is scoped and quoted before you commit, because the human work is real and hiding it inside a subscription only makes rollouts fail.`}
      >
        <div className={styles.assuranceGrid}>
          <span>Pay annually, save {Math.round(ANNUAL_DISCOUNT_RATE * 100)}%</span>
          <span>{MONEY_BACK_DAYS}-day money-back guarantee</span>
          <span>Schools from {formatUsd(SCHOOL_STARTING_TERM_PRICE)}/term</span>
        </div>
      </PageHero>

      <section className={styles.section}>
        <SectionIntro
          eyebrow="Plans"
          title="Choose by sites and capacity, not by headcount."
          copy="The plan decides how many locations you run, how many seats are included and how much finance and governance ships switched on. Your trade decides what the middle of the workflow looks like, and that costs nothing extra to choose."
        />
        <PricingCards />
        <p className={`${styles.small} ${styles.sectionFooter}`}>
          Extra seats are sold in packs of {USER_PACK_SIZE}. Extra sites are charged at each plan&rsquo;s
          per-site rate, shown in the comparison below.
        </p>
      </section>

      <section className={styles.band}>
        <div className={styles.section}>
          <SectionIntro
            eyebrow="Compare"
            title="Everything each plan includes, in one table."
            copy="Anything showing a price is available as an add-on on the lower plans at that monthly rate. Nothing here changes once you are a customer."
          />
          <div className={styles.tableFrame}>
            <table className={styles.table}>
              <caption className="sr-only">Corelith plan comparison</caption>
              <thead>
                <tr>
                  <th scope="col">&nbsp;</th>
                  {MARKETING_TIERS.map((tier) => (
                    <th key={tier.code} scope="col">
                      {tier.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TIER_COMPARISON_ROWS.map((row) => (
                  <tr key={row.label}>
                    <th scope="row">{row.label}</th>
                    {row.values.map((value, index) => (
                      <td key={`${row.label}-${MARKETING_TIERS[index]?.code ?? index}`}>{value}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <SectionIntro
          eyebrow="Add-ons"
          title="Buy depth when it pays for itself, not before."
          copy="Nothing is hidden behind a sales call. If your plan already bundles an add-on, it costs you nothing, and the table above shows which."
        />
        <AddOnTable />
      </section>

      <section className={styles.bandSunken}>
        <div className={styles.section}>
          <SectionIntro
            eyebrow="Onboarding"
            title="Setup is charged, and this is exactly what it buys."
            copy={`${LAUNCH_SPRINT_DAYS} days of scoped work: mapping how you run today, configuring it, importing your data, training your people and standing with you through the first live day. Quoted against your business before you sign anything.`}
          />
          <div className={styles.cardGrid2}>
            <article className={styles.card}>
              <h2 className={styles.cardTitle}>What onboarding covers</h2>
              <ul className={styles.checkList}>
                {onboardingCovers.map((item) => (
                  <li key={item}>
                    <Check className={styles.icon} weight="regular" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <Link href="/home/implementation-support" className={styles.inlineAction}>
                How the Launch Sprint runs
                <ArrowRight className={styles.icon} weight="regular" />
              </Link>
            </article>
            <article className={styles.card}>
              <h2 className={styles.cardTitle}>How the commercials work</h2>
              <ul className={styles.checkList}>
                {pricingPrinciples.map((principle) => (
                  <li key={principle}>
                    <Check className={styles.icon} weight="regular" />
                    <span>{principle}</span>
                  </li>
                ))}
              </ul>
            </article>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.commercialPanel}>
          <div className={styles.stack}>
            <p className={styles.eyebrow}>Schools</p>
            <h2 className={styles.sectionTitle}>Schools are priced per term, not per month.</h2>
            <p className={styles.body}>
              Fees arrive three times a year, so the software sits in the same cycle. Bands are set
              by enrolment, every band includes unlimited staff accounts, and growing inside your
              band never costs more.
            </p>
          </div>
          <div className={styles.stack}>
            <p className={styles.price}>From {formatUsd(SCHOOL_STARTING_TERM_PRICE)}/term</p>
            <Link href="/home/schools" className={styles.button}>
              See schools pricing
              <ArrowRight className={styles.icon} weight="regular" />
            </Link>
          </div>
        </div>
      </section>

      <FaqSection
        eyebrow="Pricing questions"
        title="What people ask before they sign."
        copy="Nothing here changes once you are a customer. If it is not on this page, it is not in your bill."
      />

      <CtaBand
        title="Get a real number, not a range."
        copy="Sites, seats, the pack you need and how much of your data we move. Answer the setup questions and we come back with a figure you can actually decide on."
      />
    </SiteChrome>
  );
}
