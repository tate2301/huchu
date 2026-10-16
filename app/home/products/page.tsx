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
import { STARTING_PRICE_LABEL } from "@/lib/marketing/pricing";
import {
  breadcrumbJsonLd,
  buildMarketingMetadata,
  softwareApplicationJsonLd,
} from "@/lib/marketing/seo";
import { ArrowRight, Check } from "@/lib/icons";

export const metadata: Metadata = buildMarketingMetadata(seoPages.platform);

export default function PlatformPage() {
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
            eyebrow="True in every vertical"
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
            title="Switched on inside your vertical, not sold on top of it."
            copy="Accounting, fiscalisation, payroll, portals, maintenance and the rest carry no charge of their own. You pay for the vertical, and what you switch on inside it is included."
          />
          <Link href="/home/pricing" className={`${styles.inlineAction} ${styles.sectionFooter}`}>
            {STARTING_PRICE_LABEL} per vertical. See how it is worked out
            <ArrowRight className={styles.icon} weight="regular" />
          </Link>
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
