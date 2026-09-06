import type { Metadata } from "next";

import {
  CtaBand,
  JsonLd,
  LaunchSprintSection,
  PageHero,
  SectionIntro,
  SiteChrome,
} from "@/app/home/site-components";
import { launchSprintDone, launchSprintSteps, seoPages } from "@/app/home/site-data";
import styles from "@/app/home/marketing.module.css";
import { LAUNCH_SPRINT_DAYS } from "@/lib/marketing/pricing";
import {
  breadcrumbJsonLd,
  buildMarketingMetadata,
  launchSprintJsonLd,
} from "@/lib/marketing/seo";
import { Check } from "@corelithzw/ui/lib/icons";

export const metadata: Metadata = buildMarketingMetadata(seoPages.implementation);

export default function ImplementationSupportPage() {
  return (
    <SiteChrome>
      <JsonLd
        data={[
          launchSprintJsonLd(),
          breadcrumbJsonLd([
            { name: "Home", path: "/home" },
            { name: "Implementation", path: "/home/implementation-support" },
          ]),
        ]}
      />
      <PageHero
        eyebrow="Getting it live"
        title="Software nobody finished setting up saves you nothing."
        copy={`Most systems that fail here did not fail technically. They were bought, half-configured, half-trained and quietly abandoned, and the money kept leaking the whole time. The Launch Sprint is ${LAUNCH_SPRINT_DAYS} days of scoped work that ends with your team using it on a normal Tuesday. It is quoted separately so you can see exactly what you are paying for.`}
      />

      <LaunchSprintSection />

      <section className={styles.band}>
        <div className={styles.section}>
          <SectionIntro
            eyebrow="What done looks like"
            title="A rollout ends with proof, not a login."
            copy="These are agreed with you before the sprint starts. If they are not true at the end of it, the rollout is not finished, and we will say so rather than invoice and disappear."
          />
          <div className={styles.cardGrid2}>
            {launchSprintDone.map((target) => (
              <article key={target} className={styles.compactCard}>
                <Check className={styles.cardIcon} weight="regular" />
                <p className={styles.cardTitle}>{target}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <SectionIntro
          eyebrow="The 30-day Launch Sprint"
          title="Six steps, in this order, with a person's name against each."
          copy="You should know exactly what happens and when before any money changes hands. Nothing here is discovered halfway through."
        />
        <div className={styles.tableFrame}>
          <table className={styles.table}>
            <caption className="sr-only">Corelith Launch Sprint steps</caption>
            <thead>
              <tr>
                <th scope="col">Step</th>
                <th scope="col">Purpose</th>
              </tr>
            </thead>
            <tbody>
              {launchSprintSteps.map((step) => (
                <tr key={step.title}>
                  <th scope="row">{step.title}</th>
                  <td>{step.copy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <CtaBand
        title="Ask us what a rollout would look like for you."
        copy="Your current tools, your locations, the state of your data and when you would want to go live. That is enough for us to come back with a scope and a number instead of a brochure."
      />
    </SiteChrome>
  );
}
