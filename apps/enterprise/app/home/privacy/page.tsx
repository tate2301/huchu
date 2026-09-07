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

export const metadata: Metadata = buildMarketingMetadata(seoPages.privacy);

const sections = [
  {
    title: "What the website collects",
    copy:
      "The marketing site may collect contact details, company details, industry, city, current tools, problem area, timeline and the message a visitor submits through the setup questionnaire.",
  },
  {
    title: "Why Corelith uses it",
    copy:
      "Corelith uses this information to prepare a tailored demo, respond through the selected channel, scope implementation and understand whether the product fits the business.",
  },
  {
    title: "What is not collected here",
    copy:
      "The marketing form does not create a customer account, request payment details or import operational business data into a tenant workspace.",
  },
  {
    title: "How to request changes",
    copy:
      "A visitor can ask Corelith to correct or delete marketing enquiry information by contacting hello@pagka.dev.",
  },
];

export default function PrivacyPage() {
  return (
    <SiteChrome>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/home" },
          { name: "Privacy", path: "/home/privacy" },
        ])}
      />
      <PageHero
        eyebrow="Privacy"
        title="Marketing enquiries should collect only what sales needs to respond well."
        copy="This page explains the website-level information Corelith collects before a demo or implementation conversation."
      />
      <section className={styles.section}>
        <SectionIntro eyebrow="Website privacy" title="Contact and setup details." />
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
