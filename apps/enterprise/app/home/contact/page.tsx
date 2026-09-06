import type { Metadata } from "next";

import {
  ContactChannelGrid,
  CtaBand,
  JsonLd,
  PageHero,
  SectionIntro,
  SiteChrome,
} from "@/app/home/site-components";
import { contactChecklist, seoPages } from "@/app/home/site-data";
import styles from "@/app/home/marketing.module.css";
import {
  breadcrumbJsonLd,
  buildMarketingMetadata,
  organizationJsonLd,
} from "@/lib/marketing/seo";

export const metadata: Metadata = buildMarketingMetadata(seoPages.contact);

export default function ContactPage() {
  return (
    <SiteChrome>
      <JsonLd
        data={[
          organizationJsonLd(),
          breadcrumbJsonLd([
            { name: "Home", path: "/home" },
            { name: "Contact", path: "/home/contact" },
          ]),
        ]}
      />
      <PageHero
        eyebrow="Talk to us"
        title="Ask us what it would cost you, and what it would save you."
        copy="You do not need a shortlist, a budget or a decision to ask. Tell us what you sell, how many sites you run and where the money seems to be going, and you will get a straight answer, including if the answer is that we are not the right fit yet."
      />

      <section className={styles.section}>
        <SectionIntro
          eyebrow="Pick a channel"
          title="Message us, email us, or let us set up the demo properly first."
          copy="WhatsApp is fastest and it is where most of this ends up anyway. Email suits procurement, proposals and anything a committee has to read."
        />
        <ContactChannelGrid />
      </section>

      <section className={styles.band}>
        <div className={styles.section}>
          <SectionIntro
            eyebrow="What to tell us"
            title="Six things, and the first reply will be worth reading."
            copy="We would rather come back with a real number than a range. That takes about a minute of context from you."
          />
          <div className={styles.cardGrid3}>
            {contactChecklist.map((item) => (
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
