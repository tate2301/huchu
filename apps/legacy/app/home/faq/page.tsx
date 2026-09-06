import type { Metadata } from "next";

import {
  CtaBand,
  FAQList,
  JsonLd,
  PageHero,
  SectionIntro,
  SiteChrome,
} from "@/app/home/site-components";
import { faqs, schoolsTrack, seoPages } from "@/app/home/site-data";
import styles from "@/app/home/marketing.module.css";
import {
  breadcrumbJsonLd,
  buildMarketingMetadata,
  faqJsonLd,
} from "@/lib/marketing/seo";

export const metadata: Metadata = buildMarketingMetadata(seoPages.faq);

export default function FAQPage() {
  return (
    <SiteChrome>
      <JsonLd
        data={[
          faqJsonLd([...faqs, ...schoolsTrack.faqs]),
          breadcrumbJsonLd([
            { name: "Home", path: "/home" },
            { name: "FAQ", path: "/home/faq" },
          ]),
        ]}
      />
      <PageHero
        eyebrow="Questions"
        title="Straight answers, including the ones that might rule us out."
        copy="The useful questions are never about how many features exist. They are about what this costs, what it saves, what happens to the records you already have, and what the week after go-live actually looks like."
      />

      <section className={styles.section}>
        <SectionIntro
          eyebrow="General"
          title="Fit, price, rollout and what happens after."
          copy="If one of these answers is a dealbreaker for your business, it is much cheaper to find out on this page than three weeks into a rollout."
        />
        <FAQList items={faqs} />
      </section>

      <section className={styles.band}>
        <div className={styles.section}>
          <SectionIntro
            eyebrow="Schools"
            title="Questions from heads, bursars and boards."
            copy="Schools budget per term, decide by committee and answer to the ministry, so they get their own answers and their own page."
          />
          <FAQList items={[...schoolsTrack.faqs]} />
        </div>
      </section>

      <CtaBand />
    </SiteChrome>
  );
}
