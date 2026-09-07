import type { Metadata } from "next";

import {
  CtaBand,
  JsonLd,
  MoneyTrailSection,
  PageHero,
  SectionIntro,
  SegmentCards,
  SiteChrome,
} from "@/app/home/site-components";
import { seoPages, segments } from "@/app/home/site-data";
import styles from "@/app/home/marketing.module.css";
import {
  breadcrumbJsonLd,
  buildMarketingMetadata,
  serviceJsonLd,
} from "@/lib/marketing/seo";

export const metadata: Metadata = buildMarketingMetadata(seoPages.solutions);

export default function SolutionsPage() {
  return (
    <SiteChrome>
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: "Home", path: "/home" },
            { name: "Solutions", path: "/home/solutions" },
          ]),
          ...segments.map((segment) =>
            serviceJsonLd({
              name: `${segment.title} — business software`,
              description: segment.seo.description,
              path: segment.seo.path,
              serviceType: segment.title,
              keywords: segment.seo.keywords,
            }),
          ),
        ]}
      />
      <PageHero
        eyebrow="By trade"
        title="Your business is making money. Not all of it is reaching you."
        copy="Some of it stops in a till drawer that came up short. Some sits on a shelf as stock nobody has sold since March. Some was work you did and never billed. It leaves differently in a bottle store than in a garage, so pick the one that looks like your business and see what it is worth to close."
      />

      <section className={styles.section}>
        <SectionIntro
          eyebrow="Find your business"
          title="Six trades. Six different holes. Same money."
          copy="A bottle store bleeds at the counter. A hardware yard bleeds on the shelf. A cleaning company bleeds on work it did and forgot to charge for. Start with the one that matches how you earn, and if you run two of them, that is normal and it is still one system."
        />
        <SegmentCards />
      </section>

      <MoneyTrailSection />

      <section className={styles.section}>
        <SectionIntro
          eyebrow="Who this is built for"
          title="Three to sixty staff, one to eight locations, and money moving faster than the paperwork."
          copy="If you carry stock, run jobs, bill on account or count more than one till at close, there is a gap between what your business earned and what you banked. It gets wider with every branch you open and every person you hire."
        />
        <div className={styles.cardGrid3}>
          {segments.map((segment) => (
            <article key={segment.slug} className={styles.card}>
              <p className={styles.eyebrow}>{segment.title}</p>
              <h2 className={styles.cardTitle}>{segment.audience}</h2>
              <p className={styles.body}>{segment.summary}</p>
            </article>
          ))}
        </div>
      </section>

      <CtaBand />
    </SiteChrome>
  );
}
