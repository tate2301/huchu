import type { Metadata } from "next";

import {
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
} from "@/lib/marketing/seo";

export const metadata: Metadata = buildMarketingMetadata(seoPages.terms);

const sections = [
  {
    title: "Marketing information",
    copy:
      "Website copy, pricing anchors and implementation descriptions are provided for sales conversations and may change as Corelith updates its commercial model.",
  },
  {
    title: "Pricing and proposals",
    copy:
      "Published prices are starting points. Final implementation scope, onboarding work, add-ons and enterprise requirements are confirmed in a written proposal.",
  },
  {
    title: "Demo requests",
    copy:
      "Submitting the setup questionnaire does not create a contract, subscription or workspace. It starts a sales and qualification conversation.",
  },
  {
    title: "Product availability",
    copy:
      "Features may vary by plan, industry pack, implementation scope and rollout stage. Corelith should confirm exact availability before a customer commits.",
  },
];

export default function TermsPage() {
  return (
    <SiteChrome>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/home" },
          { name: "Terms", path: "/home/terms" },
        ])}
      />
      <PageHero
        eyebrow="Terms"
        title="The website starts a commercial conversation. The proposal defines the commitment."
        copy="These terms cover the public marketing site, demo requests, pricing indications and implementation conversations."
      />
      <section className={styles.section}>
        <SectionIntro eyebrow="Website terms" title="How to read this site." />
        <div className={styles.cardGrid2}>
          {sections.map((section) => (
            <article key={section.title} className={styles.card}>
              <h2 className={styles.cardTitle}>{section.title}</h2>
              <p className={styles.body}>{section.copy}</p>
            </article>
          ))}
        </div>
      </section>
      <CtaBand />
    </SiteChrome>
  );
}
