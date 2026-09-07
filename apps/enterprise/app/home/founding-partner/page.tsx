import type { Metadata } from "next";

import {
  CtaBand,
  FoundingPartnerList,
  JsonLd,
  PageHero,
  SectionIntro,
  SiteChrome,
} from "@/app/home/site-components";
import { foundingPartnerQuestions, launchTargets, seoPages } from "@/app/home/site-data";
import styles from "@/app/home/marketing.module.css";
import {
  breadcrumbJsonLd,
  buildMarketingMetadata,
  serviceJsonLd,
} from "@/lib/marketing/seo";

export const metadata: Metadata = buildMarketingMetadata(seoPages.foundingPartner);

export default function FoundingPartnerPage() {
  return (
    <SiteChrome>
      <JsonLd
        data={[
          serviceJsonLd({
            name: "Corelith Founding Partner Programme",
            description: seoPages.foundingPartner.description,
            path: "/home/founding-partner",
            serviceType: "Business software implementation programme",
            keywords: seoPages.foundingPartner.keywords,
          }),
          breadcrumbJsonLd([
            { name: "Home", path: "/home" },
            { name: "Founding Partner Programme", path: "/home/founding-partner" },
          ]),
        ]}
      />
      <PageHero
        eyebrow="Founding Partner Programme"
        title="Better terms, in exchange for a rollout that goes properly."
        copy="A limited number of sellers, service providers, workshops and manufacturers who will put one real workflow live, tell us the truth about how it went, and agree up front how we will both judge whether it worked. You get discounted setup and your rate held for twelve months. We get the thing we cannot buy, which is evidence."
      />

      <section className={styles.section}>
        <SectionIntro
          eyebrow="What you get"
          title="Cheaper to start, fixed for a year, and closer to the people building it."
          copy="The terms are better because the first rollouts matter more to us than the margin on them. That is the whole trade, and it is worth saying plainly."
        />
        <div className={styles.demoLayout}>
          <FoundingPartnerList />
          <aside className={styles.notePanel}>
            <p className={styles.eyebrow}>First 90 days</p>
            <div className={styles.statStack}>
              {launchTargets.map((target) => (
                <div key={target.value} className={styles.statTile}>
                  <strong>{target.value}</strong>
                  <span>{target.label}</span>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </section>

      <section className={styles.band}>
        <div className={styles.section}>
          <SectionIntro
            eyebrow="What we get"
            title="We are asking for something real in return."
            copy="Time from someone senior, honest feedback when something is wrong, and permission to measure whether the rollout actually changed your numbers. If that sounds like more than you want to take on, take the normal terms instead. They are fine."
          />
          <div className={styles.cardGrid3}>
            {foundingPartnerQuestions.map((question) => (
              <article key={question} className={styles.compactCard}>
                <p className={styles.cardTitle}>{question}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <CtaBand
        title="Tell us what it is costing you."
        copy="What you run, where the money is going missing, and what the first rollout would have to change to be worth paying for. If the numbers do not work, we would both rather know now."
        href="/home/book-demo"
        label="Apply for founding partner review"
      />
    </SiteChrome>
  );
}
