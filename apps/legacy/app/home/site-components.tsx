import Link from "next/link";
import type { ReactNode } from "react";

import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  ShieldCheck,
  TriangleAlert,
} from "@corelithzw/ui/lib/icons";
import {
  PLATFORM_BRAND_INITIAL,
  PLATFORM_BRAND_NAME,
} from "@/lib/platform/brand";
import { MobileNav } from "@/app/home/mobile-nav";
import { ProductPreview } from "@/app/home/product-preview";
import { SegmentSwitcher } from "@/app/home/segment-switcher";
import {
  CONNECTED_OUTCOMES_CLOSE,
  COUNTER_TRADE,
  MONEY_LEAKS,
  MONEY_LEAK_CLOSE,
  MONEY_TRAIL,
  TRAIL_PAYOFF,
  companyPrinciples,
  connectedOutcomes,
  contactChannels,
  coreModules,
  faqs,
  footerGroups,
  foundingPartnerItems,
  launchSprintSteps,
  launchTargets,
  navItems,
  platformCapabilities,
  pricingPrinciples,
  primarySegment,
  problemFragments,
  proofFrames,
  schoolsTrack,
  segments,
  trustSignals,
  whatsappHref,
  type MarketingSegment,
} from "@/app/home/site-data";
import {
  COMPETITIVE_EDGE,
  LAUNCH_SPRINT_DAYS,
  MARKETING_ADD_ONS,
  MARKETING_TIERS,
  MONEY_BACK_DAYS,
  SCHOOL_PRICING_BANDS,
  SCHOOL_STARTING_TERM_PRICE,
  STARTING_MONTHLY_PRICE,
  TCO_ROWS,
  TCO_SITE_COUNT,
  TCO_TEAM_SIZE,
  formatUsd,
  productPriceLabel,
} from "@/lib/marketing/pricing";
import styles from "@/app/home/marketing.module.css";

export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}

export function SiteChrome({ children }: { children: ReactNode }) {
  return (
    <div className={styles.site}>
      <MarketingNav />
      {children}
      <MarketingFooter />
      <StickyCta />
    </div>
  );
}

export function MarketingNav() {
  return (
    <header className={styles.nav}>
      <div className={styles.navInner}>
        <Link href="/" className={styles.brand} aria-label={`${PLATFORM_BRAND_NAME} home`}>
          <span className={styles.brandMark}>{PLATFORM_BRAND_INITIAL}</span>
          <span>{PLATFORM_BRAND_NAME}</span>
        </Link>

        <nav className={styles.navLinks} aria-label="Marketing navigation">
          {navItems.map((item) =>
            item.label === "Solutions" ? (
              <div key={item.href} className={styles.navMenu}>
                <Link href={item.href} className={styles.navLink}>
                  {item.label}
                  <ChevronDown className={styles.icon} weight="regular" />
                </Link>
                <div className={styles.navPanel}>
                  {segments.map((segment) => (
                    <Link
                      key={segment.slug}
                      href={`/home/solutions/${segment.slug}`}
                      className={styles.navPanelItem}
                    >
                      <strong>{segment.title}</strong>
                      <span>{segment.who}</span>
                    </Link>
                  ))}
                </div>
              </div>
            ) : (
              <Link key={item.href} href={item.href} className={styles.navLink}>
                {item.label}
              </Link>
            ),
          )}
        </nav>

        <div className={styles.navActions}>
          <Link href="/login" className={styles.quietLink}>
            Sign in
          </Link>
          <Link href="/home/book-demo" className={`${styles.button} ${styles.buttonPrimary}`}>
            Find your setup
          </Link>
          <MobileNav />
        </div>
      </div>
    </header>
  );
}

/**
 * Below the desktop breakpoint the nav CTA scrolls away with the header, so the
 * primary action is pinned to the bottom of the viewport instead.
 */
export function StickyCta() {
  return (
    <div className={styles.stickyCta}>
      <div className={styles.stickyInner}>
        <div className={styles.stickyMeta}>
          <strong>From {formatUsd(STARTING_MONTHLY_PRICE)}/month</strong>
          <span>Per site, never per user</span>
        </div>
        <Link href="/home/book-demo" className={`${styles.button} ${styles.buttonPrimary}`}>
          Find your setup
        </Link>
      </div>
    </div>
  );
}

export function MarketingFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <div className={styles.footerBrand}>
          <Link href="/" className={styles.brand} aria-label={`${PLATFORM_BRAND_NAME} home`}>
            <span className={styles.brandMark}>{PLATFORM_BRAND_INITIAL}</span>
            <span>{PLATFORM_BRAND_NAME}</span>
          </Link>
          <p className={styles.body}>
            Corelith finds the money your business is already losing. Built and supported in
            Zimbabwe by Hurudza Labs.
          </p>
          <Link
            href={whatsappHref("Hi Corelith, I would like help finding the right setup.")}
            className={styles.inlineAction}
            target="_blank"
            rel="noreferrer"
          >
            Talk to us on WhatsApp
            <ExternalLink className={styles.icon} weight="regular" />
          </Link>
        </div>

        <div className={styles.footerGrid}>
          {footerGroups.map((group) => (
            <nav key={group.title} className={styles.footerGroup} aria-label={group.title}>
              <h2>{group.title}</h2>
              {group.links.map((link) => (
                <Link key={link.href} href={link.href}>
                  {link.label}
                </Link>
              ))}
            </nav>
          ))}
        </div>
      </div>

      <div className={styles.footerLegal}>
        <div className={styles.footerLegalInner}>
          <span>
            &copy; {new Date().getFullYear()} {PLATFORM_BRAND_NAME}. A Hurudza Labs product.
          </span>
          <span>Harare, Zimbabwe</span>
        </div>
      </div>
    </footer>
  );
}

export function Announcement() {
  return (
    <div className={styles.announce}>
      <div className={styles.announceInner}>
        <span>
          Founding Partner Programme: discounted onboarding, your rate held for 12 months, limited
          places.
        </span>
        <Link href="/home/founding-partner">See if you qualify</Link>
      </div>
    </div>
  );
}

export function PageHero({
  eyebrow,
  title,
  copy,
  children,
}: {
  eyebrow: string;
  title: string;
  copy: string;
  children?: ReactNode;
}) {
  return (
    <div className={styles.heroBackdrop}>
      <section className={styles.pageHero}>
        <div className={styles.pageHeroTitle}>
          <p className={styles.eyebrow}>{eyebrow}</p>
          <h1 className={styles.display}>{title}</h1>
        </div>
        <div className={styles.pageHeroAside}>
          <p className={styles.lead}>{copy}</p>
          {children}
        </div>
      </section>
    </div>
  );
}

export function SectionIntro({
  eyebrow,
  title,
  copy,
  centered = false,
}: {
  eyebrow: string;
  title: string;
  copy?: string;
  centered?: boolean;
}) {
  return (
    <div className={`${styles.sectionIntro} ${centered ? styles.sectionIntroCentered : ""}`}>
      <div className={styles.stack}>
        <p className={styles.eyebrow}>{eyebrow}</p>
        <h2 className={styles.sectionTitle}>{title}</h2>
      </div>
      {copy ? <p className={styles.lead}>{copy}</p> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Landing page sections
// ---------------------------------------------------------------------------

export function HomeHero() {
  return (
    <>
      <Announcement />
      <div className={styles.heroBackdrop}>
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <span className={styles.eyebrowMark}>
              <ShieldCheck className={styles.icon} weight="regular" />
              Business software, built in Zimbabwe
            </span>
            <h1 className={styles.display}>You earned more last month than you banked.</h1>
            <p className={styles.lead}>
              The difference is sitting in a drawer that came up short, a shelf that has not moved
              since March, and a job somebody did and nobody billed. Corelith puts your sales,
              stock, jobs, invoices and cash on one record, so a gap shows up the day it opens
              instead of at year end. Built in Zimbabwe, works through load-shedding, fiscalised for
              ZIMRA.
            </p>
            <div className={styles.buttonRow}>
              <Link href="/home/book-demo" className={`${styles.button} ${styles.buttonPrimary}`}>
                Show me where my money is going
                <ArrowRight className={styles.icon} weight="regular" />
              </Link>
              <Link href="/home/pricing" className={styles.button}>
                See what it costs
              </Link>
            </div>
            <div className={styles.assuranceGrid}>
              <span>From {formatUsd(STARTING_MONTHLY_PRICE)}/month</span>
              <span>Priced per site, not per user</span>
              <span>{MONEY_BACK_DAYS}-day money-back guarantee</span>
            </div>
          </div>
          <ProductPreview />
        </section>
      </div>
      <TrustStrip />
    </>
  );
}

export function TrustStrip() {
  return (
    <div className={styles.trustStrip}>
      <div className={styles.trustInner}>
        {trustSignals.map((signal) => {
          const Icon = signal.icon;

          return (
            <div key={signal.label} className={styles.trustItem}>
              <Icon className={styles.icon} weight="regular" />
              <span>{signal.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The intersection section. Six trades, six different leaks, one problem — and
 * a reader finds themselves in the list rather than being sorted into a
 * category. This is the page's argument, so it runs before anything about the
 * product.
 */
export function MoneyLeakSection() {
  return (
    <section className={`${styles.section} ${styles.reveal}`}>
      <SectionIntro
        eyebrow="Where it goes"
        title="Six trades. Six places the money walks out."
        copy="Nobody loses money in one big event. It goes in small amounts on ordinary days, in the part of the business nobody can watch while you are busy running the rest of it. Add up a year of it and it is usually the difference between a good year and a flat one."
      />

      <div className={styles.leakGrid}>
        {MONEY_LEAKS.map((leak) => {
          const Icon = leak.icon;

          return (
            <article key={leak.where} className={styles.leakCard}>
              <Icon className={styles.cardIcon} weight="regular" />
              <h3 className={styles.cardTitle}>{leak.where}</h3>
              <p className={styles.eyebrow}>{leak.who}</p>
              <p className={styles.body}>{leak.copy}</p>
            </article>
          );
        })}
      </div>

      <p className={`${styles.leakClose} ${styles.sectionFooter}`}>{MONEY_LEAK_CLOSE}</p>
    </section>
  );
}

/** Why the leak is invisible: an evidence problem, not a software one. */
export function ProblemSection() {
  return (
    <section className={styles.band}>
      <div className={`${styles.section} ${styles.reveal}`}>
        <SectionIntro
          eyebrow="Why you cannot see it"
          title="You are not careless. You are running the business off six things that do not talk."
          copy="Each of these works well enough on its own. The money goes missing in the space between them, because not one of them ever shows you the whole day."
        />

        <div className={styles.problemGrid}>
          <div className={styles.problemSources}>
            {problemFragments.map((item) => {
              const Icon = item.icon;

              return (
                <article key={item.label} className={styles.compactCard}>
                  <Icon className={styles.cardIcon} weight="regular" />
                  <h3 className={styles.cardTitle}>{item.label}</h3>
                  <p className={styles.body}>{item.copy}</p>
                </article>
              );
            })}
          </div>

          <div className={styles.outcomePanel}>
            <p className={styles.eyebrow}>What you get instead</p>
            <div className={styles.outcomeList}>
              {connectedOutcomes.map((outcome) => (
                <div key={outcome} className={styles.outcomeItem}>
                  <Check className={styles.icon} weight="regular" />
                  <span>{outcome}</span>
                </div>
              ))}
            </div>
            <p className={styles.small}>{CONNECTED_OUTCOMES_CLOSE}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * The mechanism. A reader who has just recognised their own leak wants to know
 * what actually stops it — so this is framed as the trail behind the money,
 * with the counter-trade version sitting beside it rather than buried.
 */
export function MoneyTrailSection() {
  return (
    <section className={`${styles.section} ${styles.reveal}`}>
      <SectionIntro
        eyebrow="How it stops"
        title="Put a trail behind every dollar."
        copy="From the first enquiry to the money in your account, every step writes to the same record. Nothing gets re-typed, nothing gets remembered wrong, and nothing goes quiet between one person and the next."
      />

      <div className={styles.loopFrame}>
        <ol className={styles.loop}>
          {MONEY_TRAIL.map((step, index) => {
            const Icon = step.icon;

            return (
              <li
                key={step.step}
                className={`${styles.loopStep} ${step.step === "You deliver" ? styles.loopStepFocus : ""}`}
              >
                <span className={styles.loopIndex}>
                  <Icon className={styles.icon} weight="regular" />
                  {String(index + 1).padStart(2, "0")}
                </span>
                <strong>{step.step}</strong>
                <p>{step.copy}</p>
              </li>
            );
          })}
        </ol>

        <div className={styles.loopEffects}>
          {TRAIL_PAYOFF.map((effect) => (
            <div key={effect.label} className={styles.loopEffect}>
              <strong>{effect.label}</strong>
              <span>{effect.copy}</span>
            </div>
          ))}
        </div>
      </div>

      <CounterTradeNote />
    </section>
  );
}

/**
 * Counter trade gets its own panel because the six-step trail genuinely does not
 * describe a till. Handled quietly, a bottle store owner reads the trail above,
 * decides this is not for them, and leaves.
 */
export function CounterTradeNote() {
  return (
    <div className={`${styles.counterPanel} ${styles.sectionFooter}`}>
      <div className={styles.counterCopy}>
        <p className={styles.eyebrow}>{COUNTER_TRADE.eyebrow}</p>
        <h3 className={styles.cardTitle}>{COUNTER_TRADE.title}</h3>
        <p className={styles.body}>{COUNTER_TRADE.copy}</p>
        <p className={styles.small}>{COUNTER_TRADE.who}</p>
      </div>

      <ol className={styles.counterSteps}>
        {COUNTER_TRADE.steps.map((step, index) => {
          const Icon = step.icon;

          return (
            <li key={step.step} className={styles.counterStep}>
              <span className={styles.loopIndex}>
                <Icon className={styles.icon} weight="regular" />
                {String(index + 1).padStart(2, "0")}
              </span>
              <strong>{step.step}</strong>
              <p>{step.copy}</p>
            </li>
          );
        })}
      </ol>

      <div className={styles.counterProof}>
        {COUNTER_TRADE.proof.map((item) => (
          <div key={item.label} className={styles.counterProofItem}>
            <strong>{item.value}</strong>
            <span>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SegmentSection() {
  return (
    <section className={`${styles.section} ${styles.reveal}`}>
      <SectionIntro
        eyebrow="Find your trade"
        title="Pick your trade. It is already set up."
        copy="Same platform underneath, same books, same permissions. The screens, the language and the reports match how your business actually runs, so nobody spends six months configuring it before it earns you anything."
      />
      <SegmentSwitcher />
    </section>
  );
}

export function SegmentCards() {
  const SchoolsIcon = schoolsTrack.icon;

  return (
    <div className={styles.segmentGrid}>
      {segments.map((segment) => {
        const Icon = segment.icon;

        return (
          <Link
            key={segment.slug}
            href={`/home/solutions/${segment.slug}`}
            className={styles.segmentCard}
          >
            <div className={styles.cardTopline}>
              <Icon className={styles.cardIcon} weight="regular" />
              <span>{productPriceLabel(segment.pricingSlug)}</span>
            </div>
            <h3 className={styles.cardTitle}>{segment.title}</h3>
            <p className={styles.body}>{segment.who}</p>
            <p className={styles.body}>{segment.headline}</p>
            <span className={styles.inlineAction}>
              {segment.cta}
              <ChevronRight className={styles.icon} weight="regular" />
            </span>
          </Link>
        );
      })}

      <Link href="/home/schools" className={styles.segmentCard}>
        <div className={styles.cardTopline}>
          <SchoolsIcon className={styles.cardIcon} weight="regular" />
          <span>From {formatUsd(SCHOOL_STARTING_TERM_PRICE)}/term</span>
        </div>
        <h3 className={styles.cardTitle}>Schools</h3>
        <p className={styles.body}>
          Private, mission, boarding and group schools. Priced per campus, per term, against
          enrolment.
        </p>
        <p className={styles.body}>Fees collected on time, and one student record instead of four.</p>
        <span className={styles.inlineAction}>
          {schoolsTrack.cta}
          <ChevronRight className={styles.icon} weight="regular" />
        </span>
      </Link>
    </div>
  );
}

export function ModuleGrid() {
  return (
    <div className={styles.moduleGrid}>
      {coreModules.map((module) => {
        const Icon = module.icon;

        return (
          <article key={module.name} className={styles.moduleCard}>
            <Icon className={styles.cardIcon} weight="regular" />
            <h3 className={styles.cardTitle}>{module.name}</h3>
            <p className={styles.body}>{module.copy}</p>
            <div className={styles.chipList}>
              {module.highlights.map((highlight) => (
                <span key={highlight}>{highlight}</span>
              ))}
            </div>
            <div className={styles.connection}>
              <p>{module.connection}</p>
            </div>
          </article>
        );
      })}
    </div>
  );
}

export function ModulesSection() {
  return (
    <section className={`${styles.section} ${styles.reveal}`}>
      <SectionIntro
        eyebrow="What you actually get"
        title="Five modules, one record underneath all of them."
        copy="A sale, a job card or a stock receipt gets written once and read by everything else. That is why the numbers stop disagreeing, and why nobody types the same figure into three places."
      />
      <ModuleGrid />
      <div className={`${styles.buttonRow} ${styles.sectionFooter}`}>
        <Link href="/home/products" className={styles.button}>
          See every module and add-on
          <ArrowRight className={styles.icon} weight="regular" />
        </Link>
      </div>
    </section>
  );
}

export function PlatformCapabilities() {
  return (
    <div className={styles.capabilityGrid}>
      {platformCapabilities.map((capability) => {
        const Icon = capability.icon;

        return (
          <article key={capability.title} className={styles.card}>
            <Icon className={styles.cardIcon} weight="regular" />
            <h3 className={styles.cardTitle}>{capability.title}</h3>
            <p className={styles.body}>{capability.copy}</p>
          </article>
        );
      })}
    </div>
  );
}

export function DifferentiatorSection() {
  return (
    <section className={styles.bandSunken}>
      <div className={`${styles.section} ${styles.reveal}`}>
        <SectionIntro
          eyebrow="Do the maths"
          title="The cheapest option in the room is usually the one costing you the most."
          copy={`Costed at a shape you will probably recognise: ${TCO_TEAM_SIZE} staff across ${TCO_SITE_COUNT} sites. Competitor figures are published list prices and are indicative rather than quotes.`}
        />

        <div className={styles.tableFrame}>
          <table className={styles.table}>
            <caption className="sr-only">
              Corelith compared with per-seat suites, legacy desktop software and spreadsheets
            </caption>
            <thead>
              <tr>
                <th scope="col">&nbsp;</th>
                <th scope="col">Corelith</th>
                <th scope="col">Per-seat cloud suite</th>
                <th scope="col">Legacy desktop</th>
                <th scope="col">Spreadsheets</th>
              </tr>
            </thead>
            <tbody>
              {TCO_ROWS.map((row) => (
                <tr key={row.label}>
                  <th scope="row">{row.label}</th>
                  <td className={styles.tableOwn}>{row.corelith}</td>
                  <td>{row.perSeatSuite}</td>
                  <td>{row.legacyDesktop}</td>
                  <td>{row.spreadsheets}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

export function CompetitiveEdgeGrid() {
  return (
    <div className={styles.cardGrid3}>
      {COMPETITIVE_EDGE.map((edge) => (
        <article key={edge.title} className={styles.card}>
          <Check className={styles.cardIcon} weight="regular" />
          <h3 className={styles.cardTitle}>{edge.title}</h3>
          <p className={styles.body}>{edge.copy}</p>
        </article>
      ))}
    </div>
  );
}

export function Workflow({ steps }: { steps: string[] }) {
  return (
    <ol className={styles.workflow}>
      {steps.map((step, index) => (
        <li key={`${step}-${index}`} className={styles.workflowStep}>
          <span>{String(index + 1).padStart(2, "0")}</span>
          <strong>{step}</strong>
        </li>
      ))}
    </ol>
  );
}

export function LaunchSprintSection() {
  return (
    <section className={`${styles.section} ${styles.reveal}`}>
      <SectionIntro
        eyebrow={`The ${LAUNCH_SPRINT_DAYS}-day Launch Sprint`}
        title="Software nobody finished setting up saves you nothing."
        copy={`Most software failures are not bad software. They are a rollout that stopped halfway, so the team went back to the notebook and the money kept leaking. The Sprint is scoped, quoted and owned like the work it is: ${LAUNCH_SPRINT_DAYS} days from mapping your workflow to reviewing your first month of real numbers.`}
      />

      <div className={styles.stepGrid}>
        {launchSprintSteps.map((step, index) => {
          const Icon = step.icon;

          return (
            <article key={step.title} className={styles.stepCard}>
              <div className={styles.cardTopline}>
                <Icon className={styles.cardIcon} weight="regular" />
                <span>Step {String(index + 1).padStart(2, "0")}</span>
              </div>
              <h3 className={styles.cardTitle}>{step.title}</h3>
              <p className={styles.body}>{step.copy}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function LaunchTargetStrip() {
  return (
    <div className={styles.statStrip}>
      {launchTargets.map((target) => (
        <div key={target.value} className={styles.statTile}>
          <strong>{target.value}</strong>
          <span>{target.label}</span>
        </div>
      ))}
    </div>
  );
}

export function PricingCards({ limit }: { limit?: number }) {
  const tiers = typeof limit === "number" ? MARKETING_TIERS.slice(0, limit) : MARKETING_TIERS;

  return (
    <div className={`${styles.pricingGrid} ${tiers.length === 3 ? styles.pricingGrid3 : ""}`}>
      {tiers.map((tier) => (
        <article
          key={tier.code}
          className={`${styles.priceCard} ${tier.isMostPopular ? styles.priceCardFeatured : ""}`}
        >
          <div className={styles.priceHeader}>
            <p className={styles.eyebrow}>{tier.tagline}</p>
            {tier.isMostPopular ? <span className={styles.statusPill}>Most chosen</span> : null}
          </div>
          <h3 className={styles.priceTitle}>{tier.name}</h3>
          <p className={styles.price}>{formatUsd(tier.monthlyPrice)}/mo</p>
          <p className={styles.priceMeta}>
            {formatUsd(tier.annualMonthlyPrice)}/mo billed annually &middot;{" "}
            {tier.includedSites} {tier.includedSites === 1 ? "site" : "sites"} &middot;{" "}
            {tier.includedUsers === null ? "unlimited users" : `${tier.includedUsers} users`}
          </p>
          <p className={styles.body}>{tier.bestFor}</p>
          <ul className={styles.checkList}>
            {tier.highlights.slice(0, 4).map((highlight) => (
              <li key={highlight}>
                <Check className={styles.icon} weight="regular" />
                <span>{highlight}</span>
              </li>
            ))}
          </ul>
          <Link
            href={tier.ctaHref}
            className={`${styles.button} ${tier.isMostPopular ? styles.buttonPrimary : ""}`}
          >
            {tier.ctaLabel}
          </Link>
        </article>
      ))}
    </div>
  );
}

export function PricingPreviewSection() {
  return (
    <section className={`${styles.section} ${styles.reveal}`}>
      <SectionIntro
        eyebrow="What it costs"
        title="Pay for sites and capacity. Never for how many people use it."
        copy="Plans run from $29 a month for one site to $449 for twenty-five. Every cashier, clerk, technician and rep is included up to your seat ceiling, so putting the whole team on it costs you nothing extra."
      />
      <PricingCards limit={3} />
      <div className={`${styles.principlePanel} ${styles.sectionFooter}`}>
        <p className={styles.eyebrow}>How the commercials work</p>
        <ul className={styles.checkList}>
          {pricingPrinciples.map((principle) => (
            <li key={principle}>
              <Check className={styles.icon} weight="regular" />
              <span>{principle}</span>
            </li>
          ))}
        </ul>
        <p className={styles.small}>
          Hold it to this: catch one short cash-up, one dead-stock order or one unbilled job a
          month, and it has already paid for itself.
        </p>
        <Link href="/home/pricing" className={styles.inlineAction}>
          See full pricing, add-ons and the plan comparison
          <ArrowRight className={styles.icon} weight="regular" />
        </Link>
      </div>
    </section>
  );
}

export function AddOnTable() {
  return (
    <div className={styles.tableFrame}>
      <table className={styles.table}>
        <caption className="sr-only">Corelith add-on pricing</caption>
        <thead>
          <tr>
            <th scope="col">Add-on</th>
            <th scope="col">Category</th>
            <th scope="col">Monthly</th>
            <th scope="col">What it adds</th>
          </tr>
        </thead>
        <tbody>
          {MARKETING_ADD_ONS.map((addOn) => (
            <tr key={addOn.code}>
              <th scope="row">{addOn.name}</th>
              <td>{addOn.category}</td>
              <td>{formatUsd(addOn.monthlyPrice)}</td>
              <td>{addOn.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SchoolBands() {
  return (
    <div className={styles.pricingGrid}>
      {SCHOOL_PRICING_BANDS.map((band) => (
        <article
          key={band.code}
          className={`${styles.priceCard} ${band.isMostPopular ? styles.priceCardFeatured : ""}`}
        >
          <div className={styles.priceHeader}>
            <p className={styles.eyebrow}>
              {band.maxStudents === null
                ? "Over 1,500 students"
                : `Up to ${band.maxStudents.toLocaleString("en-US")} students`}
            </p>
            {band.isMostPopular ? <span className={styles.statusPill}>Most chosen</span> : null}
          </div>
          <h3 className={styles.priceTitle}>{band.name}</h3>
          <p className={styles.price}>
            {band.termPrice === null ? "Tailored" : `${formatUsd(band.termPrice)}/term`}
          </p>
          <p className={styles.priceMeta}>Per campus, per term</p>
          <p className={styles.body}>{band.summary}</p>
          <ul className={styles.checkList}>
            {band.includes.map((item) => (
              <li key={item}>
                <Check className={styles.icon} weight="regular" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <Link href="/home/book-demo?interest=schools" className={styles.button}>
            {band.termPrice === null ? "Request a group quote" : "Arrange a consultation"}
          </Link>
        </article>
      ))}
    </div>
  );
}

export function ProofSection() {
  return (
    <section className={`${styles.section} ${styles.reveal}`}>
      <SectionIntro
        eyebrow="How you will know it worked"
        title="Judge it on three numbers out of your own business."
        copy="Nothing on this page is worth as much as what happens in your own figures. So we measure these three before go-live, agree the targets in writing, and measure them again after."
      />
      <div className={styles.cardGrid3}>
        {proofFrames.map((frame) => {
          const Icon = frame.icon;

          return (
            <article key={frame.title} className={styles.card}>
              <Icon className={styles.cardIcon} weight="regular" />
              <p className={styles.eyebrow}>{frame.metric}</p>
              <h3 className={styles.cardTitle}>{frame.title}</h3>
              <p className={styles.body}>{frame.copy}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function FaqSection({
  items = faqs,
  eyebrow = "Before you decide",
  title = "The questions worth asking before you commit.",
  copy = "If one of these answers rules us out for your business, that is a good outcome for both of us and it costs you nothing to find out here.",
}: {
  items?: Array<{ q: string; a: string }>;
  eyebrow?: string;
  title?: string;
  copy?: string;
}) {
  return (
    <section className={styles.band}>
      <div className={`${styles.section} ${styles.reveal}`}>
        <SectionIntro eyebrow={eyebrow} title={title} copy={copy} />
        <FAQList items={items} />
      </div>
    </section>
  );
}

export function FAQList({ items = faqs }: { items?: Array<{ q: string; a: string }> }) {
  return (
    <div className={styles.faqList}>
      {items.map((faq) => (
        <details key={faq.q} className={styles.faqItem}>
          <summary>
            {faq.q}
            <ChevronDown className={styles.icon} weight="regular" />
          </summary>
          <p className={styles.faqAnswer}>{faq.a}</p>
        </details>
      ))}
    </div>
  );
}

export function CtaBand({
  eyebrow = "Next step",
  title = "Find out what the gap is costing you.",
  copy = "Tell us your trade, your sites, what you use today and where you think the money is going. You get a demo running your own workflow and a straight view of what closing that gap is worth in a month.",
  href = "/home/book-demo",
  label = "Find your setup",
  secondary = true,
}: {
  eyebrow?: string;
  title?: string;
  copy?: string;
  href?: string;
  label?: string;
  secondary?: boolean;
}) {
  return (
    <section className={styles.section}>
      <div className={styles.ctaPanel}>
        <p className={styles.eyebrow}>{eyebrow}</p>
        <h2 className={styles.sectionTitle}>{title}</h2>
        <p className={styles.lead}>{copy}</p>
        <div className={styles.buttonRow}>
          <Link href={href} className={styles.button}>
            {label}
            <ArrowRight className={styles.icon} weight="regular" />
          </Link>
          {secondary ? (
            <Link
              href={whatsappHref("Hi Corelith, I would like help finding the right setup.")}
              className={`${styles.button} ${styles.buttonQuiet}`}
              target="_blank"
              rel="noreferrer"
            >
              Or message us on WhatsApp
              <ExternalLink className={styles.icon} weight="regular" />
            </Link>
          ) : null}
        </div>
        <p className={styles.small}>
          {MONEY_BACK_DAYS}-day money-back guarantee &middot; no per-user fees &middot; your data
          exports at any time
        </p>
      </div>
    </section>
  );
}

export function ContactChannelGrid() {
  return (
    <div className={styles.cardGrid3}>
      {contactChannels.map((channel) => {
        const Icon = channel.icon;

        return (
          <article key={channel.title} className={styles.card}>
            <Icon className={styles.cardIcon} weight="regular" />
            <p className={styles.eyebrow}>{channel.title}</p>
            <h2 className={styles.cardTitle}>{channel.value}</h2>
            <p className={styles.body}>{channel.copy}</p>
            <Link
              href={channel.href}
              target={channel.external ? "_blank" : undefined}
              rel={channel.external ? "noreferrer" : undefined}
              className={styles.inlineAction}
            >
              Start here
              {channel.external ? (
                <ExternalLink className={styles.icon} weight="regular" />
              ) : (
                <ArrowRight className={styles.icon} weight="regular" />
              )}
            </Link>
          </article>
        );
      })}
    </div>
  );
}

export function CompanyPrinciples() {
  return (
    <div className={styles.cardGrid2}>
      {companyPrinciples.map((principle) => {
        const Icon = principle.icon;

        return (
          <article key={principle.title} className={styles.card}>
            <Icon className={styles.cardIcon} weight="regular" />
            <h2 className={styles.cardTitle}>{principle.title}</h2>
            <p className={styles.body}>{principle.copy}</p>
          </article>
        );
      })}
    </div>
  );
}

export function FoundingPartnerList() {
  return (
    <div className={styles.card}>
      <ul className={styles.checkList}>
        {foundingPartnerItems.map((item) => (
          <li key={item}>
            <Check className={styles.icon} weight="regular" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Segment detail page
// ---------------------------------------------------------------------------

export function SegmentDetail({ segment }: { segment: MarketingSegment }) {
  const Icon = segment.icon;
  const priceLabel = productPriceLabel(segment.pricingSlug);

  return (
    <SiteChrome>
      <div className={styles.heroBackdrop}>
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <Icon className={styles.heroIcon} weight="regular" />
            <p className={styles.eyebrow}>{segment.eyebrow}</p>
            <h1 className={styles.display}>{segment.headline}</h1>
            <p className={styles.lead}>{segment.summary}</p>
            <p className={styles.body}>{segment.audience}</p>
            <div className={styles.buttonRow}>
              <Link
                href={`/home/book-demo?interest=${segment.slug}`}
                className={`${styles.button} ${styles.buttonPrimary}`}
              >
                {segment.cta}
                <ArrowRight className={styles.icon} weight="regular" />
              </Link>
              <Link
                href={whatsappHref(segment.whatsapp)}
                className={styles.button}
                target="_blank"
                rel="noreferrer"
              >
                WhatsApp sales
                <ExternalLink className={styles.icon} weight="regular" />
              </Link>
            </div>
            <div className={styles.assuranceGrid}>
              {priceLabel ? <span>{priceLabel}</span> : null}
              <span>Per site, not per user</span>
              <span>{LAUNCH_SPRINT_DAYS}-day Launch Sprint</span>
            </div>
          </div>
          <ProductPreview initialSlug={segment.slug} compact />
        </section>
      </div>

      <TrustStrip />

      <section className={`${styles.section} ${styles.reveal}`}>
        <SectionIntro
          eyebrow={segment.sectionIntros.pains.eyebrow}
          title={segment.sectionIntros.pains.title}
          copy={segment.sectionIntros.pains.copy}
        />
        <div className={styles.cardGrid2}>
          {segment.pains.map((pain) => (
            <article key={pain} className={styles.card}>
              <TriangleAlert className={styles.cardIcon} weight="regular" />
              <p className={styles.body}>{pain}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.band}>
        <div className={`${styles.section} ${styles.reveal}`}>
          <SectionIntro
            eyebrow={segment.sectionIntros.workflow.eyebrow}
            title={segment.sectionIntros.workflow.title}
            copy={segment.sectionIntros.workflow.copy}
          />
          <Workflow steps={segment.workflow} />

          {segment.modes ? (
            <div className={`${styles.cardGrid2} ${styles.sectionFooter}`}>
              {segment.modes.map((mode) => {
                const ModeIcon = mode.icon;

                return (
                  <article key={mode.name} className={styles.card}>
                    <ModeIcon className={styles.cardIcon} weight="regular" />
                    <h3 className={styles.cardTitle}>{mode.name}</h3>
                    <p className={styles.eyebrow}>{mode.who}</p>
                    <p className={styles.body}>{mode.copy}</p>
                    <div className={styles.chipList}>
                      {mode.steps.map((step) => (
                        <span key={step}>{step}</span>
                      ))}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : null}
        </div>
      </section>

      <section className={`${styles.section} ${styles.reveal}`}>
        <SectionIntro
          eyebrow={segment.sectionIntros.capabilities.eyebrow}
          title={segment.sectionIntros.capabilities.title}
          copy={segment.sectionIntros.capabilities.copy}
        />
        <div className={styles.cardGrid2}>
          {segment.capabilities.map((capability) => {
            const CapabilityIcon = capability.icon;

            return (
              <article key={capability.title} className={styles.card}>
                <CapabilityIcon className={styles.cardIcon} weight="regular" />
                <h3 className={styles.cardTitle}>{capability.title}</h3>
                <p className={styles.body}>{capability.copy}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className={styles.bandSunken}>
        <div className={`${styles.section} ${styles.reveal}`}>
          <SectionIntro
            eyebrow={segment.sectionIntros.outcomes.eyebrow}
            title={segment.sectionIntros.outcomes.title}
            copy={segment.sectionIntros.outcomes.copy}
          />
          <div className={styles.cardGrid2}>
            {segment.outcomes.map((outcome) => (
              <article key={outcome} className={styles.compactCard}>
                <Check className={styles.cardIcon} weight="regular" />
                <p className={styles.cardTitle}>{outcome}</p>
              </article>
            ))}
          </div>
          <div className={styles.statStrip}>
            {segment.proofMetrics.map((metric) => (
              <div key={metric.label} className={styles.statTile}>
                <strong>{metric.value}</strong>
                <span>{metric.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.reveal}`}>
        <SectionIntro
          eyebrow={segment.sectionIntros.commercials.eyebrow}
          title={segment.sectionIntros.commercials.title}
          copy={segment.sectionIntros.commercials.copy}
        />
        <div className={styles.commercialPanel}>
          <div className={styles.stack}>
            <p className={styles.eyebrow}>Starting point</p>
            <p className={styles.price}>{priceLabel ?? "Tailored"}</p>
            <p className={styles.body}>
              Priced per site with seats included up to your ceiling. Onboarding is scoped and
              quoted separately, before you commit to anything.
            </p>
            <Link href="/home/pricing" className={styles.inlineAction}>
              See full pricing
              <ArrowRight className={styles.icon} weight="regular" />
            </Link>
          </div>
          <div className={styles.tagList}>
            {segment.modules.map((module) => (
              <span key={module}>{module}</span>
            ))}
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.reveal}`}>
        <SectionIntro
          eyebrow="Not quite you?"
          title="Money leaves a garage differently to a bottle store."
          copy="If your business straddles two of these, that is normal, and it is still one system either way."
        />
        <SegmentCards />
      </section>

      <CtaBand
        href={`/home/book-demo?interest=${segment.slug}`}
        label={segment.cta}
        title={`See Corelith running a ${segment.title.toLowerCase().replace(/s$/, "")} workflow.`}
      />
    </SiteChrome>
  );
}

/** Back-compat aliases for callers still using the old vocabulary. */
export const SolutionDetail = ({ solution }: { solution: MarketingSegment }) => (
  <SegmentDetail segment={solution} />
);
export const SolutionCards = SegmentCards;

export function PrimarySegmentNote() {
  return (
    <div className={styles.notePanel}>
      <p className={styles.eyebrow}>Where most rollouts start</p>
      <h2 className={styles.cardTitle}>{primarySegment.headline}</h2>
      <p className={styles.body}>
        Stock-led businesses feel the gap first and fix it fastest, which is why the seller setup is
        the most complete and the quickest to go live.
      </p>
      <Link href={`/home/solutions/${primarySegment.slug}`} className={styles.inlineAction}>
        Open the seller page
        <ArrowRight className={styles.icon} weight="regular" />
      </Link>
    </div>
  );
}

export const PrimarySolutionNote = PrimarySegmentNote;
