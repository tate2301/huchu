import type { Metadata } from "next";
import Link from "next/link";

import {
  CtaBand,
  FaqSection,
  JsonLd,
  PageHero,
  PricingCards,
  SectionIntro,
  SiteChrome,
} from "@/app/home/site-components";
import {
  FDMS_STATUS_COPY,
  FDMS_STATUS_HEADLINE,
  memberRules,
  onboardingCovers,
  paymentMethods,
  pricingFaqs,
  pricingPrinciples,
  seoPages,
} from "@/app/home/site-data";
import styles from "@/app/home/marketing.module.css";
import {
  INCLUDED_MEMBERS,
  LARGE_PRICE,
  LAUNCH_SPRINT_DAYS,
  MARKETING_VERTICALS,
  MONEY_BACK_DAYS,
  PRICE_EXAMPLES,
  SMALL_PRICE,
  TRIAL_DAYS,
  formatUsd,
} from "@/lib/marketing/pricing";
import {
  breadcrumbJsonLd,
  buildMarketingMetadata,
  offerCatalogJsonLd,
} from "@/lib/marketing/seo";
import { ArrowRight, Check, ChevronRight, Info } from "@/lib/icons";

export const metadata: Metadata = buildMarketingMetadata(seoPages.pricing);

/**
 * One rule, from `lib/platform/verticals.ts` through `lib/marketing/pricing.ts`:
 * each vertical at the small rate up to the included members, the large rate
 * above, every vertical the same. Nothing on this page types a figure — a
 * hand-typed price is a price that will one day disagree with the invoice.
 */
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
        title={`${formatUsd(SMALL_PRICE)} a month per vertical.`}
        copy={`A vertical is one line of business you run on Corelith: a shop, a school, a mine, a workshop. Each one is ${formatUsd(SMALL_PRICE)} a month while your workspace has up to ${INCLUDED_MEMBERS} people, and ${formatUsd(LARGE_PRICE)} a month once it has more. Everything inside a vertical is included.`}
      >
        <div className={styles.assuranceGrid}>
          <span>{TRIAL_DAYS}-day trial</span>
          <span>{MONEY_BACK_DAYS}-day money-back guarantee</span>
          <span>Parents and students are not counted</span>
        </div>
      </PageHero>

      <section className={styles.section}>
        <SectionIntro
          eyebrow="The rate"
          title="Two rates, set by how many people you have."
          copy="Every vertical is charged at the same rate, so a second vertical adds the same again. Features, add-ons and bundles inside a vertical carry no charge of their own."
        />
        <PricingCards />

        <div className={`${styles.notePanel} ${styles.sectionFooter}`}>
          <p className={styles.eyebrow}>
            <Info className={styles.icon} weight="regular" /> Before you pay us anything
          </p>
          <h3 className={styles.cardTitle}>{FDMS_STATUS_HEADLINE}</h3>
          <p className={styles.body}>{FDMS_STATUS_COPY}</p>
        </div>
      </section>

      <section className={styles.band}>
        <div className={styles.section}>
          <SectionIntro
            eyebrow="Worked examples"
            title="Count your verticals and your people. That is the whole sum."
            copy={`Up to ${INCLUDED_MEMBERS} people, each vertical is ${formatUsd(SMALL_PRICE)}. From ${INCLUDED_MEMBERS + 1} people, each vertical is ${formatUsd(LARGE_PRICE)}. Multiply by the verticals you run.`}
          />
          <div className={styles.tableFrame}>
            <table className={styles.table}>
              <caption className="sr-only">What a month costs for some example workspaces</caption>
              <thead>
                <tr>
                  <th scope="col" className={styles.tableNumeric}>
                    Verticals
                  </th>
                  <th scope="col" className={styles.tableNumeric}>
                    People
                  </th>
                  <th scope="col" className={styles.tableNumeric}>
                    Each vertical
                  </th>
                  <th scope="col" className={styles.tableNumeric}>
                    A month
                  </th>
                </tr>
              </thead>
              <tbody>
                {PRICE_EXAMPLES.map((example) => (
                  <tr key={`${example.verticals}-${example.members}`}>
                    <th scope="row" className={styles.tableNumeric}>
                      {example.verticals}
                    </th>
                    <td className={styles.tableNumeric}>{example.members}</td>
                    <td className={styles.tableNumeric}>{formatUsd(example.each)}</td>
                    <td className={`${styles.tableNumeric} ${styles.tableOwn}`}>
                      {formatUsd(example.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <SectionIntro
          eyebrow="Verticals"
          title="Pick the lines of business you run."
          copy="Each one is charged at the same rate. Run two and you pay for two."
        />
        <div className={styles.cardGrid3}>
          {MARKETING_VERTICALS.map((vertical) => (
            <Link key={vertical.code} href={vertical.href} className={styles.segmentCard}>
              <h3 className={styles.cardTitle}>{vertical.label}</h3>
              <p className={styles.body}>{vertical.copy}</p>
              <span className={styles.inlineAction}>
                {vertical.href.startsWith("/home/book-demo")
                  ? `Ask about ${vertical.label.toLowerCase()}`
                  : `See ${vertical.label.toLowerCase()}`}
                <ChevronRight className={styles.icon} weight="regular" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className={styles.bandSunken}>
        <div className={styles.section}>
          <SectionIntro
            eyebrow="The detail"
            title="Who counts, and what you are paying for."
            copy="Written down here so nothing on the invoice comes as a surprise."
          />
          <div className={styles.cardGrid2}>
            <article className={styles.card}>
              <h3 className={styles.cardTitle}>Who counts as one of your people</h3>
              <ul className={styles.checkList}>
                {memberRules.map((rule) => (
                  <li key={rule}>
                    <Check className={styles.icon} weight="regular" />
                    <span>{rule}</span>
                  </li>
                ))}
              </ul>
            </article>
            <article className={styles.card}>
              <h3 className={styles.cardTitle}>How the commercials work</h3>
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
        <SectionIntro
          eyebrow="Getting live"
          title="There is no onboarding fee. This is what getting live involves."
          copy={`${LAUNCH_SPRINT_DAYS} days of scoped work: mapping how you run today, configuring it, importing your data, training your people and standing with you through the first live day.`}
        />
        <article className={styles.card}>
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
      </section>

      <section className={styles.section}>
        <SectionIntro
          eyebrow="Payment"
          title="How you actually pay us."
          copy="Published for the same reason the prices are: you should be able to work out the whole commitment without asking a salesperson."
        />
        <div className={styles.cardGrid2}>
          {paymentMethods.map((method) => (
            <article key={method.title} className={styles.compactCard}>
              <h3 className={styles.cardTitle}>{method.title}</h3>
              <p className={styles.body}>{method.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <FaqSection
        items={pricingFaqs}
        eyebrow="Pricing questions"
        title="What people ask before they sign."
        copy="If it is not on this page, it is not in your bill."
      />

      <CtaBand
        title="You can work out the price here. The demo shows what it buys."
        copy="Tell us your trade and how many people would use it. We open the demo on your own workflow, not an empty account."
      />
    </SiteChrome>
  );
}
