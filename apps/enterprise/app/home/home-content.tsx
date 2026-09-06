import {
  CompetitiveEdgeGrid,
  CtaBand,
  DifferentiatorSection,
  FaqSection,
  HomeHero,
  JsonLd,
  LaunchSprintSection,
  MoneyLeakSection,
  MoneyTrailSection,
  ModulesSection,
  PricingPreviewSection,
  ProblemSection,
  ProofSection,
  SectionIntro,
  SegmentSection,
  SiteChrome,
} from "@/app/home/site-components";
import { faqs } from "@/app/home/site-data";
import styles from "@/app/home/marketing.module.css";
import {
  breadcrumbJsonLd,
  faqJsonLd,
  organizationJsonLd,
  softwareApplicationJsonLd,
  websiteJsonLd,
} from "@/lib/marketing/seo";

/**
 * The landing page argues one thing: money you have already earned is leaving,
 * and you cannot see where. Everything else is evidence for that claim or the
 * answer to it — because a visitor is only ever deciding whether this makes
 * them money or saves them money.
 *
 *   a question you cannot answer      → hero, trust strip
 *   where your money actually goes    → the leaks, six trades, one problem
 *   why you cannot see it             → six versions of the truth
 *   what stops it                     → the trail, plus the counter version
 *   is this me?                       → segment switcher
 *   what do I actually get            → modules
 *   why not the cheaper option        → comparison and differentiators
 *   will the rollout finish           → Launch Sprint
 *   what does it cost, and does it pay → pricing preview
 *   why should I believe you          → honest proof framing
 *   what is still bothering me        → FAQ
 *   do the thing                      → CTA
 */
export function HomeMarketingPage() {
  return (
    <SiteChrome>
      <JsonLd
        data={[
          organizationJsonLd(),
          websiteJsonLd(),
          softwareApplicationJsonLd(),
          faqJsonLd(faqs.slice(0, 6)),
          breadcrumbJsonLd([{ name: "Home", path: "/home" }]),
        ]}
      />
      <HomeHero />
      <MoneyLeakSection />
      <ProblemSection />
      <MoneyTrailSection />
      <SegmentSection />
      <ModulesSection />
      <DifferentiatorSection />

      <section className={`${styles.section} ${styles.reveal}`}>
        <SectionIntro
          eyebrow="What actually makes the difference"
          title="Six things that decide whether this works here."
          copy="Not feature counts — nobody ever made money off a feature count. These are the conditions a system has to survive in this country, and the commercial terms that decide whether you can afford to put your whole team on it."
        />
        <CompetitiveEdgeGrid />
      </section>

      <div className={styles.bandSunken}>
        <LaunchSprintSection />
      </div>

      <PricingPreviewSection />
      <ProofSection />
      <FaqSection />
      <CtaBand />
    </SiteChrome>
  );
}
