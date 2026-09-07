import type { Metadata } from "next";
import Link from "next/link";

import { CtaBand, JsonLd, PageHero, SiteChrome } from "@/app/home/site-components";
import { freeTools, seoPages } from "@/app/home/site-data";
import styles from "@/app/home/marketing.module.css";
import { breadcrumbJsonLd, buildMarketingMetadata } from "@/lib/marketing/seo";
import { ArrowRight } from "@corelithzw/ui/lib/icons";

export const metadata: Metadata = buildMarketingMetadata(seoPages.tools);

/**
 * The tools index exists so the two calculators have a parent to be linked and
 * indexed from. Both are ungated on purpose: a tool an accountant has to hand
 * over an email address for is a lead form wearing a calculator's clothes, and
 * accountants can tell.
 */
export default function ToolsPage() {
  return (
    <SiteChrome>
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: "Home", path: "/home" },
            { name: "Free tools", path: seoPages.tools.path },
          ]),
        ]}
      />

      <PageHero
        eyebrow="Free tools"
        title="Two compliance numbers, worked out properly."
        copy="Both run the statutory arithmetic, both name the instrument the figure comes from, and neither asks for your email. Use them, check them, and send us the ones that look wrong."
      >
        <div className={styles.assuranceGrid}>
          <span>No sign-up</span>
          <span>Sources named on every page</span>
          <span>Built in Zimbabwe</span>
        </div>
      </PageHero>

      <section className={styles.section}>
        <div className={styles.cardGrid2}>
          {freeTools.map((tool) => {
            const Icon = tool.icon;

            return (
              <article key={tool.slug} className={styles.card}>
                <Icon className={styles.cardIcon} weight="regular" />
                <h2 className={styles.cardTitle}>{tool.name}</h2>
                <p className={styles.body}>{tool.summary}</p>
                <Link href={tool.href} className={styles.inlineAction}>
                  Open it
                  <ArrowRight className={styles.icon} weight="regular" />
                </Link>
              </article>
            );
          })}
        </div>
      </section>

      <CtaBand
        eyebrow="Next step"
        title="Found a number you did not like?"
        copy="Tell us how many tills and sites you run and what you are using today. We will tell you what fiscalising them takes and what it costs, without a callback queue."
      />
    </SiteChrome>
  );
}
