import type { Metadata } from "next";

import {
  CompanyPrinciples,
  CtaBand,
  JsonLd,
  PageHero,
  SectionIntro,
  SiteChrome,
} from "@/app/home/site-components";
import { seoPages } from "@/app/home/site-data";
import styles from "@/app/home/marketing.module.css";
import {
  breadcrumbJsonLd,
  buildMarketingMetadata,
  organizationJsonLd,
} from "@/lib/marketing/seo";

export const metadata: Metadata = buildMarketingMetadata(seoPages.about);

export default function AboutPage() {
  return (
    <SiteChrome>
      <JsonLd
        data={[
          organizationJsonLd(),
          breadcrumbJsonLd([
            { name: "Home", path: "/home" },
            { name: "About", path: "/home/about" },
          ]),
        ]}
      />
      <PageHero
        eyebrow="Why we built this"
        title="Most businesses here are more profitable than their records make them look."
        copy="Corelith is built by Hurudza Labs in Harare, for owners running three to sixty staff across one to eight locations. Businesses that outgrew the notebook years ago, cannot justify a foreign-consultant ERP project, and are losing real money in the gap between the two."
      />

      <section className={styles.section}>
        <SectionIntro
          eyebrow="Where we stand"
          title="The constraints here are the brief, not the excuse."
          copy="Load-shedding, patchy data, USD and ZWG side by side, WhatsApp as the place business happens, ZIMRA, staff who move on, and an owner who does not trust a number on a screen until it matches the shelf. Software written somewhere else treats all of that as an edge case. Here it is the starting point."
        />
        <CompanyPrinciples />
      </section>

      <section className={styles.band}>
        <div className={styles.section}>
          <SectionIntro
            eyebrow="Being straight"
            title="Not a cheap till clone, and not an ERP slogan."
            copy="A till that talks to nobody leaves you exactly where you started. A twelve-month ERP project costs more than the leak it was bought to fix. What is left is the useful middle, and that is the only thing we are trying to build."
          />
          <div className={styles.cardGrid3}>
            {[
              "A till that takes money and tells nobody leaves you where you started.",
              "An ERP project can cost more than the leak it was bought to fix.",
              "The useful middle is the only thing worth building, so that is what we build.",
            ].map((item) => (
              <article key={item} className={styles.compactCard}>
                <p className={styles.cardTitle}>{item}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <CtaBand />
    </SiteChrome>
  );
}
