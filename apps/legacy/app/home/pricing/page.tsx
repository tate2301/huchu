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
import {
  FDMS_STATUS_COPY,
  FDMS_STATUS_HEADLINE,
  onboardingCovers,
  paymentMethods,
  pricingPrinciples,
  seoPages,
  whatsappHref,
} from "@/app/home/site-data";
import styles from "@/app/home/marketing.module.css";
import {
  ANNUAL_DISCOUNT_RATE,
  ENTRY_TIER,
  LAUNCH_SPRINT_DAYS,
  MARKETING_TIERS,
  MONEY_BACK_DAYS,
  SCHOOL_STARTING_TERM_PRICE,
  TIER_COMPARISON_ROWS,
  USER_PACK_SIZE,
  formatUsd,
  getMarketingTier,
} from "@/lib/marketing/pricing";
import { PENALTY_CAP_DAYS, PENALTY_USD_PER_TILL_PER_DAY } from "@/lib/marketing/penalty";
import {
  breadcrumbJsonLd,
  buildMarketingMetadata,
  offerCatalogJsonLd,
} from "@/lib/marketing/seo";
import { ArrowRight, Check, ExternalLink, Info } from "@corelithzw/ui/lib/icons";

export const metadata: Metadata = buildMarketingMetadata(seoPages.pricing);

/**
 * The fiscal SKU is the wedge, so it leads the page (MK-1.2). Every figure on
 * this page is read from the billing catalog through `lib/marketing/pricing.ts`
 * — a hand-typed price here is a price that will one day disagree with the
 * invoice, and a buyer who catches that stops believing the rest of the page.
 */
const fiscalTier = getMarketingTier("FISCAL") ?? ENTRY_TIER;

const ANNUAL_DISCOUNT_PERCENT = Math.round(ANNUAL_DISCOUNT_RATE * 100);

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
        title={`Fiscalise from ${formatUsd(fiscalTier.annualMonthlyPrice)} a month.`}
        copy={`ZIMRA fiscalisation is an obligation with a daily price attached, so it is the cheapest thing we sell and the first thing you should buy. Everything above it — POS, stock, books, payroll — is depth you add when it pays for itself. Priced per site, never per user, and quoted in US dollars.`}
      >
        <div className={styles.assuranceGrid}>
          <span>Pay annually, save {ANNUAL_DISCOUNT_PERCENT}%</span>
          <span>{MONEY_BACK_DAYS}-day money-back guarantee</span>
          <span>Schools from {formatUsd(SCHOOL_STARTING_TERM_PRICE)}/term</span>
        </div>
      </PageHero>

      <section className={styles.section}>
        <SectionIntro
          eyebrow="Start here"
          title="The fiscal plan, priced against what a default costs."
          copy={`An unfiscalised point of sale carries a civil penalty of ${formatUsd(PENALTY_USD_PER_TILL_PER_DAY)} a day, for up to ${PENALTY_CAP_DAYS} days, before the liability stops being a fine and becomes a criminal matter. That is the number this plan is priced against.`}
        />
        <div className={styles.commercialPanel}>
          <div className={styles.stack}>
            <p className={styles.eyebrow}>
              {fiscalTier.name} &middot; {fiscalTier.tagline}
            </p>
            <h2 className={styles.sectionTitle}>{fiscalTier.bestFor}</h2>
            <ul className={styles.checkList}>
              {fiscalTier.highlights.map((highlight) => (
                <li key={highlight}>
                  <Check className={styles.icon} weight="regular" />
                  <span>{highlight}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className={styles.stack}>
            <p className={styles.price}>{formatUsd(fiscalTier.annualMonthlyPrice)}/mo</p>
            <p className={styles.priceMeta}>
              billed annually &middot; {formatUsd(fiscalTier.monthlyPrice)}/mo month to month
            </p>
            <p className={styles.priceMeta}>
              {fiscalTier.onboardingLabel} &middot; {fiscalTier.includedSites}{" "}
              {fiscalTier.includedSites === 1 ? "site" : "sites"} &middot;{" "}
              {fiscalTier.includedUsers === null
                ? "unlimited users"
                : `${fiscalTier.includedUsers} users`}
            </p>
            <Link
              href={fiscalTier.ctaHref}
              className={`${styles.button} ${styles.buttonPrimary}`}
            >
              {fiscalTier.ctaLabel}
              <ArrowRight className={styles.icon} weight="regular" />
            </Link>
            <Link
              href={whatsappHref(
                `Hi Corelith, I want to fiscalise. I run tills and want to know what ${fiscalTier.name} would cost me.`,
              )}
              className={`${styles.button} ${styles.buttonQuiet}`}
              target="_blank"
              rel="noreferrer"
            >
              Ask on WhatsApp
              <ExternalLink className={styles.icon} weight="regular" />
            </Link>
            <Link href="/home/tools/fiscalisation-penalty" className={styles.inlineAction}>
              Work out what a default is costing you
              <ArrowRight className={styles.icon} weight="regular" />
            </Link>
          </div>
        </div>

        <div className={`${styles.notePanel} ${styles.sectionFooter}`}>
          <p className={styles.eyebrow}>
            <Info className={styles.icon} weight="regular" /> Before you pay us anything
          </p>
          <h3 className={styles.cardTitle}>{FDMS_STATUS_HEADLINE}</h3>
          <p className={styles.body}>{FDMS_STATUS_COPY}</p>
        </div>
      </section>

      <section className={styles.section}>
        <SectionIntro
          eyebrow="Plans"
          title="Then choose by sites and capacity, not by headcount."
          copy="The plan decides how many locations you run, how many seats are included and how much finance and governance ships switched on. Your trade decides what the middle of the workflow looks like, and that costs nothing extra to choose."
        />
        <PricingCards />
        <p className={`${styles.small} ${styles.sectionFooter}`}>
          Every price shown is per month. Annual prepay is {ANNUAL_DISCOUNT_PERCENT}% cheaper and is
          the default ask. Onboarding is a published one-off per plan, shown in the comparison
          below. Extra seats are sold in packs of {USER_PACK_SIZE}. Extra sites are charged at each
          plan&rsquo;s per-site rate.
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
        copy="Tills, sites, seats, the pack you need and how much of your data we move. Answer the setup questions and we come back with a figure you can actually decide on."
      />
    </SiteChrome>
  );
}
