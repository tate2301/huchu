import type { Metadata } from "next";

import { DemoRequestForm } from "@/app/home/book-demo/demo-request-form";
import {
  JsonLd,
  PageHero,
  SectionIntro,
  SiteChrome,
} from "@/app/home/site-components";
import { seoPages, setupQuestions } from "@/app/home/site-data";
import styles from "@/app/home/marketing.module.css";
import {
  breadcrumbJsonLd,
  buildMarketingMetadata,
} from "@/lib/marketing/seo";

type Props = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata: Metadata = buildMarketingMetadata(seoPages.bookDemo);

export default async function BookDemoPage({ searchParams }: Props) {
  const params = searchParams ? await searchParams : {};
  const rawInterest = params.interest ?? params.product ?? params.plan;
  const initialInterest = Array.isArray(rawInterest) ? rawInterest[0] : rawInterest;

  return (
    <SiteChrome>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/home" },
          { name: "Find your setup", path: "/home/book-demo" },
        ])}
      />
      <PageHero
        eyebrow="Find your setup"
        title="Tell us where the money goes. We will show you the part that stops it."
        copy="About a minute of questions: what you sell, how many sites, what you use now, and what is bothering you. Then the demo opens on your trade with your kind of numbers in it, instead of a blank account you have to imagine your business into. No obligation, no card, and a real price rather than a range."
      />

      <section className={styles.section}>
        <SectionIntro
          eyebrow="Before we meet"
          title="Short answers are fine. Rough numbers are fine."
          copy="Nobody is going to hold you to what you type here. The more we know beforehand, the less of your time the first call wastes, and the sooner you get a figure worth deciding on."
        />
        <div className={styles.demoLayout}>
          <DemoRequestForm initialInterest={initialInterest} />
          <aside className={styles.notePanel}>
            <p className={styles.eyebrow}>What this captures</p>
            <ul className={styles.checkList}>
              {setupQuestions.map((question) => (
                <li key={question}>
                  <span>{question}</span>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </section>
    </SiteChrome>
  );
}
