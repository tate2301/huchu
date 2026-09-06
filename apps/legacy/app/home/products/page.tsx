import type { Metadata } from "next";
import Link from "next/link";

import {
  CtaBand,
  FaqSection,
  JsonLd,
  ModuleGrid,
  PageHero,
  PlatformCapabilities,
  PrimarySegmentNote,
  SectionIntro,
  SegmentCards,
  SiteChrome,
  Workflow,
} from "@/app/home/site-components";
import { ProductPreview } from "@/app/home/product-preview";
import {
  MONEY_TRAIL,
  coreModules,
  firstRollout,
  primarySegment,
  seoPages,
} from "@/app/home/site-data";
import styles from "@/app/home/marketing.module.css";
import {
  MARKETING_TIERS,
  addOnsByCategory,
  formatUsd,
} from "@/lib/marketing/pricing";
import {
  breadcrumbJsonLd,
  buildMarketingMetadata,
  softwareApplicationJsonLd,
} from "@/lib/marketing/seo";
import { ArrowRight, Check } from "@/lib/icons";

export const metadata: Metadata = buildMarketingMetadata(seoPages.platform);

/** The cheapest plan that already bundles an add-on, for the "included from" note. */
function lowestTierIncluding(tierCodes: string[]): string | null {
  const tier = MARKETING_TIERS.find((candidate) => tierCodes.includes(candidate.code));
  return tier?.name ?? null;
}

export default function PlatformPage() {
  const groups = addOnsByCategory();

  return (
    <SiteChrome>
      <JsonLd
        data={[
          softwareApplicationJsonLd(),
          breadcrumbJsonLd([
            { name: "Home", path: "/home" },
            { name: "Platform", path: "/home/products" },
          ]),
        ]}
      />
      <PageHero
        eyebrow="The platform"
        title="One record. Every part of the business reading the same fact."
        copy="Most businesses are not short of software. They are short of agreement between the software they have. A sale written once is a sale that stock, costing, the ledger and the owner all see the same way, which is why the numbers stop drifting apart and money stops falling into the gaps between them."
      >
        <div className={styles.buttonRow}>
          <Link href="/home/book-demo" className={`${styles.button} ${styles.buttonPrimary}`}>
            Find your setup
            <ArrowRight className={styles.icon} weight="regular" />
          </Link>
          <Link href="/home/pricing" className={styles.button}>
            See what it costs
          </Link>
        </div>
      </PageHero>

      <section className={styles.section}>
        <ProductPreview />
      </section>

      <section className={styles.band}>
        <div className={styles.section}>
          <SectionIntro
            eyebrow="The five modules"
            title="Written once, read five ways."
            copy="A sale is not copied into stock and then again into the ledger. It is written once, and everything else reads it. Copying is where numbers disagree, and disagreeing numbers are where money hides."
          />
          <ModuleGrid />
        </div>
      </section>

      <section className={styles.section}>
        <SectionIntro
          eyebrow="How they meet"
          title="Follow one order from hello to bank."
          copy="Every module has a job in this and every handover happens without anyone re-typing anything. That is the whole mechanism."
        />
        <Workflow steps={MONEY_TRAIL.map((step) => step.step)} />

        <div className={`${styles.tableFrame} ${styles.sectionFooter}`}>
          <table className={styles.table}>
            <caption className="sr-only">What each Corelith module owns and connects into</caption>
            <thead>
              <tr>
                <th scope="col">Module</th>
                <th scope="col">What it owns</th>
                <th scope="col">What it changes elsewhere</th>
              </tr>
            </thead>
            <tbody>
              {coreModules.map((module) => (
                <tr key={module.name}>
                  <th scope="row">{module.name}</th>
                  <td>{module.copy}</td>
                  <td>{module.connection}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.bandSunken}>
        <div className={styles.section}>
          <SectionIntro
            eyebrow="True on every plan"
            title="The things that decide whether it survives a normal week here."
            copy="Load-shedding, a dead link, two currencies and a ZIMRA obligation are not edge cases. Software that ignores them costs you more than software that costs more."
          />
          <PlatformCapabilities />
        </div>
      </section>

      <section className={styles.section}>
        <SectionIntro
          eyebrow="Industry packs"
          title="The middle of the loop, shaped like your trade."
          copy="Selling, servicing, fixing, making and quoting all look different in the middle and identical at both ends. Start with one pack. Adding another later is a setting, not a second project."
        />
        <SegmentCards />
      </section>

      <section className={styles.band}>
        <div className={styles.section}>
          <SectionIntro
            eyebrow="Add-ons"
            title="Depth you switch on when it starts paying for itself."
            copy="Every add-on is priced monthly and listed here in full. Several are already bundled into the higher plans, so check the plan comparison before you buy anything twice."
          />

          {groups.map((group) => {
            return (
              <div key={group.category} className={styles.sectionFooter}>
                <p className={styles.eyebrow}>{group.category}</p>
                <div className={`${styles.cardGrid3} ${styles.sectionFooter}`}>
                  {group.addOns.map((addOn) => {
                    const bundledFrom = lowestTierIncluding(addOn.includedInTiers);

                    return (
                      <article key={addOn.code} className={styles.compactCard}>
                        <div className={styles.cardTopline}>
                          <h3 className={styles.cardTitle}>{addOn.name}</h3>
                          <span>{formatUsd(addOn.monthlyPrice)}/mo</span>
                        </div>
                        <p className={styles.body}>{addOn.description}</p>
                        <p className={styles.small}>
                          {bundledFrom
                            ? `Already included from ${bundledFrom} upwards`
                            : `${addOn.featureCount} features`}
                        </p>
                      </article>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className={styles.section}>
        <SectionIntro
          eyebrow="Where to start"
          title="You do not switch everything on in week one."
          copy="Turn on the part that is losing you money this month. The rest waits, and turning it on later does not disturb what is already running."
        />
        <div className={styles.problemGrid}>
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>A sensible first rollout</h2>
            <ul className={styles.checkList}>
              {firstRollout.map((item) => (
                <li key={item}>
                  <Check className={styles.icon} weight="regular" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <PrimarySegmentNote />
        </div>
      </section>

      <FaqSection
        eyebrow="Platform questions"
        title="What people ask once they have seen the modules."
        copy="If one of these is a dealbreaker, it is much cheaper to find out on this page than three weeks into a rollout."
      />

      <CtaBand
        title={`See the platform on a ${primarySegment.title.toLowerCase().replace(/s$/, "")} workflow, or on yours.`}
      />
    </SiteChrome>
  );
}
