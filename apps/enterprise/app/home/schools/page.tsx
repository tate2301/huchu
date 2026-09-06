import type { Metadata } from "next";
import Link from "next/link";

import {
  CtaBand,
  FAQList,
  JsonLd,
  SchoolBands,
  SectionIntro,
  SiteChrome,
  Workflow,
} from "@/app/home/site-components";
import { schoolsTrack, seoPages, whatsappHref } from "@/app/home/site-data";
import styles from "@/app/home/marketing.module.css";
import {
  SCHOOL_ADD_ONS,
  SCHOOL_GROUP_INDICATIVE_PER_STUDENT_PER_TERM,
  TERMS_PER_YEAR,
  formatUsd,
} from "@/lib/marketing/pricing";
import {
  breadcrumbJsonLd,
  buildMarketingMetadata,
  faqJsonLd,
  serviceJsonLd,
} from "@/lib/marketing/seo";
import {
  ArrowRight,
  Check,
  ExternalLink,
  TriangleAlert,
} from "@corelithzw/ui/lib/icons";

export const metadata: Metadata = buildMarketingMetadata(seoPages.schools);

/**
 * Schools get their own page rather than a slot under `/home/solutions`.
 *
 * They do not run order-to-cash, they budget per term rather than per month,
 * and the decision goes through a board. Folding them into the main funnel
 * would blunt both stories, so the whole track — pitch, capabilities, pricing
 * and FAQ — lives here on one page a bursar can send to a committee.
 */
export default function SchoolsPage() {
  const SchoolsIcon = schoolsTrack.icon;

  return (
    <SiteChrome>
      <JsonLd
        data={[
          serviceJsonLd({
            name: "Corelith Schools",
            description: seoPages.schools.description,
            path: "/home/schools",
            serviceType: "School management software",
            keywords: seoPages.schools.keywords,
          }),
          faqJsonLd([...schoolsTrack.faqs]),
          breadcrumbJsonLd([
            { name: "Home", path: "/home" },
            { name: "Schools", path: "/home/schools" },
          ]),
        ]}
      />

      <div className={styles.heroBackdrop}>
        <section className={styles.pageHero}>
          <div className={styles.pageHeroTitle}>
            <SchoolsIcon className={styles.heroIcon} weight="regular" />
            <p className={styles.eyebrow}>{schoolsTrack.eyebrow}</p>
            <h1 className={styles.display}>{schoolsTrack.headline}</h1>
          </div>
          <div className={styles.pageHeroAside}>
            <p className={styles.lead}>{schoolsTrack.summary}</p>
            <p className={styles.body}>{schoolsTrack.audience}</p>
            <div className={styles.buttonRow}>
              <Link
                href="/home/book-demo?interest=schools"
                className={`${styles.button} ${styles.buttonPrimary}`}
              >
                {schoolsTrack.cta}
                <ArrowRight className={styles.icon} weight="regular" />
              </Link>
              <Link
                href={whatsappHref(schoolsTrack.whatsapp)}
                className={styles.button}
                target="_blank"
                rel="noreferrer"
              >
                {schoolsTrack.secondaryCta}
                <ExternalLink className={styles.icon} weight="regular" />
              </Link>
            </div>
            <div className={styles.assuranceGrid}>
              {schoolsTrack.assurances.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          </div>
        </section>
      </div>

      <section className={styles.section}>
        <SectionIntro
          eyebrow={schoolsTrack.sectionIntros.why.eyebrow}
          title={schoolsTrack.sectionIntros.why.title}
          copy={schoolsTrack.sectionIntros.why.copy}
        />
        <div className={styles.cardGrid2}>
          {schoolsTrack.pains.map((pain) => (
            <article key={pain} className={styles.card}>
              <TriangleAlert className={styles.cardIcon} weight="regular" />
              <p className={styles.body}>{pain}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.band}>
        <div className={styles.section}>
          <SectionIntro
            eyebrow={schoolsTrack.sectionIntros.year.eyebrow}
            title={schoolsTrack.sectionIntros.year.title}
            copy={schoolsTrack.sectionIntros.year.copy}
          />
          <Workflow steps={[...schoolsTrack.workflow]} />
        </div>
      </section>

      <section className={styles.section}>
        <SectionIntro
          eyebrow={schoolsTrack.sectionIntros.included.eyebrow}
          title={schoolsTrack.sectionIntros.included.title}
          copy={schoolsTrack.sectionIntros.included.copy}
        />
        <div className={styles.cardGrid3}>
          {schoolsTrack.capabilities.map((capability) => {
            const Icon = capability.icon;

            return (
              <article key={capability.title} className={styles.card}>
                <Icon className={styles.cardIcon} weight="regular" />
                <h2 className={styles.cardTitle}>{capability.title}</h2>
                <p className={styles.body}>{capability.copy}</p>
              </article>
            );
          })}
        </div>
      </section>

      {/* ── Pricing lives on this page, not on /home/pricing ── */}
      <section className={styles.bandSunken} id="pricing">
        <div className={styles.section}>
          <SectionIntro
            eyebrow={schoolsTrack.sectionIntros.pricing.eyebrow}
            title={schoolsTrack.sectionIntros.pricing.title}
            copy={schoolsTrack.sectionIntros.pricing.copy}
          />
          <SchoolBands />

          <div className={`${styles.cardGrid2} ${styles.sectionFooter}`}>
            <article className={styles.card}>
              <h2 className={styles.cardTitle}>What every band includes</h2>
              <ul className={styles.checkList}>
                {[
                  "Unlimited staff and teacher accounts",
                  "Every campus keeps its own registers and fee structure",
                  "Term and year-end reporting in the shape a board asks for",
                  "Attendance and fee capture that works with no connection",
                  "Your records exported whenever you ask",
                ].map((item) => (
                  <li key={item}>
                    <Check className={styles.icon} weight="regular" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </article>

            <article className={styles.card}>
              <h2 className={styles.cardTitle}>Over 1,500 students</h2>
              <p className={styles.body}>
                Group quotes work from an indicative{" "}
                {formatUsd(SCHOOL_GROUP_INDICATIVE_PER_STUDENT_PER_TERM * 100)} per 100 students per
                term, which keeps the per-student rate below the Premier band. Growing past a band
                should never cost a school more per head than staying inside it.
              </p>
              <p className={styles.body}>
                Billed {TERMS_PER_YEAR} times a year, in line with how fees actually arrive.
              </p>
              <Link href="/home/book-demo?interest=schools" className={styles.inlineAction}>
                Request a group quote
                <ArrowRight className={styles.icon} weight="regular" />
              </Link>
            </article>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <SectionIntro
          eyebrow={schoolsTrack.sectionIntros.addOns.eyebrow}
          title={schoolsTrack.sectionIntros.addOns.title}
          copy={schoolsTrack.sectionIntros.addOns.copy}
        />
        <div className={styles.tableFrame}>
          <table className={styles.table}>
            <caption className="sr-only">Corelith school add-ons</caption>
            <thead>
              <tr>
                <th scope="col">Add-on</th>
                <th scope="col">Price</th>
                <th scope="col">What it adds</th>
              </tr>
            </thead>
            <tbody>
              {SCHOOL_ADD_ONS.map((addOn) => (
                <tr key={addOn.name}>
                  <th scope="row">{addOn.name}</th>
                  <td>{formatUsd(addOn.termPrice)}/term</td>
                  <td>{addOn.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.band}>
        <div className={styles.section}>
          <SectionIntro
            eyebrow={schoolsTrack.sectionIntros.outcomes.eyebrow}
            title={schoolsTrack.sectionIntros.outcomes.title}
            copy={schoolsTrack.sectionIntros.outcomes.copy}
          />
          <div className={styles.cardGrid2}>
            {schoolsTrack.outcomes.map((outcome) => (
              <article key={outcome} className={styles.compactCard}>
                <Check className={styles.cardIcon} weight="regular" />
                <p className={styles.cardTitle}>{outcome}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <SectionIntro
          eyebrow={schoolsTrack.sectionIntros.faq.eyebrow}
          title={schoolsTrack.sectionIntros.faq.title}
          copy={schoolsTrack.sectionIntros.faq.copy}
        />
        <FAQList items={[...schoolsTrack.faqs]} />
      </section>

      <CtaBand
        eyebrow="Next step"
        title="Start with a conversation, not a checkout page."
        copy="Tell us your enrolment, your campuses, your fee structure, what you use now and when in the year you would want to switch. You get back a scoped rollout plan and a price your board can read."
        href="/home/book-demo?interest=schools"
        label={schoolsTrack.cta}
      />
    </SiteChrome>
  );
}
