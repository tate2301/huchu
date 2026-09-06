"use client";

import Link from "next/link";
import { useState } from "react";

import { ArrowRight, ChevronRight, TriangleAlert } from "@/lib/icons";
import { segments } from "@/app/home/site-data";
import styles from "@/app/home/marketing.module.css";

/**
 * The landing page's self-identification step.
 *
 * The page has already argued that all five businesses run one loop. This is
 * where a visitor confirms it for their own case in about two seconds, then
 * leaves for the page written specifically for them — which is the conversion
 * this section exists to produce.
 */
export function SegmentSwitcher() {
  const [activeSlug, setActiveSlug] = useState(segments[0].slug);
  const active = segments.find((segment) => segment.slug === activeSlug) ?? segments[0];
  const Icon = active.icon;

  return (
    <div>
      <div className={styles.segmentTabs} role="tablist" aria-label="Business type">
        {segments.map((segment) => {
          const TabIcon = segment.icon;
          const selected = segment.slug === active.slug;

          return (
            <button
              key={segment.slug}
              type="button"
              role="tab"
              id={`segment-tab-${segment.slug}`}
              aria-selected={selected}
              aria-controls="segment-panel"
              className={`${styles.segmentTab} ${selected ? styles.segmentTabActive : ""}`}
              onClick={() => setActiveSlug(segment.slug)}
            >
              <TabIcon className={styles.icon} weight="regular" />
              {segment.title}
            </button>
          );
        })}
      </div>

      <div
        className={styles.segmentPanel}
        id="segment-panel"
        role="tabpanel"
        aria-labelledby={`segment-tab-${active.slug}`}
      >
        <div className={styles.segmentPanelCopy}>
          <Icon className={styles.cardIcon} weight="regular" />
          <p className={styles.eyebrow}>{active.who}</p>
          <h3 className={styles.sectionTitle}>{active.headline}</h3>
          <p className={styles.body}>{active.summary}</p>
          {active.modes ? (
            <div className={styles.chipList}>
              {active.modes.map((mode) => (
                <span key={mode.name}>{mode.name}</span>
              ))}
            </div>
          ) : null}
          <Link href={`/home/solutions/${active.slug}`} className={styles.inlineAction}>
            {active.cta}
            <ChevronRight className={styles.icon} weight="regular" />
          </Link>
        </div>

        <div className={styles.segmentPanelAside}>
          <p className={styles.eyebrow}>Where the money goes today</p>
          <ul className={styles.painList}>
            {active.landingPains.map((pain) => (
              <li key={pain}>
                <TriangleAlert className={styles.icon} weight="regular" />
                <span>{pain}</span>
              </li>
            ))}
          </ul>

          <div className={styles.proofBlock}>
            <p className={styles.eyebrow}>
              On the trail, your <strong>deliver</strong> step is: {active.deliverStep.label}
            </p>
            <p className={styles.body}>{active.deliverStep.copy}</p>
          </div>

          <Link
            href={`/home/book-demo?interest=${active.slug}`}
            className={`${styles.button} ${styles.buttonPrimary}`}
          >
            Set this up for my business
            <ArrowRight className={styles.icon} weight="regular" />
          </Link>
        </div>
      </div>
    </div>
  );
}
