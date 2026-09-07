"use client";

import { useState } from "react";

import { CheckCircle, TriangleAlert } from "@corelithzw/ui/lib/icons";
import { segments } from "@/app/home/site-data";
import styles from "@/app/home/marketing.module.css";

const toneIcon = {
  neutral: CheckCircle,
  success: CheckCircle,
  warn: TriangleAlert,
};

export function ProductPreview({
  initialSlug = segments[0].slug,
  compact = false,
}: {
  initialSlug?: string;
  compact?: boolean;
}) {
  const [activeSlug, setActiveSlug] = useState(initialSlug);
  const active = segments.find((segment) => segment.slug === activeSlug) ?? segments[0];
  const visual = active.productVisual;

  return (
    <aside
      className={`${styles.productPreview} ${compact ? styles.productPreviewCompact : ""}`}
      aria-label="Corelith interface preview"
    >
      <div className={styles.previewHeader}>
        <div>
          <p className={styles.eyebrow}>{visual.eyebrow}</p>
          <h2 className={styles.cardTitle}>{visual.title}</h2>
        </div>
        <span className={styles.statusPill}>{visual.status}</span>
      </div>

      <div className={styles.previewTabs} role="tablist" aria-label="Preview business type">
        {segments.map((segment) => {
          const Icon = segment.icon;
          const selected = segment.slug === active.slug;

          return (
            <button
              key={segment.slug}
              type="button"
              role="tab"
              aria-selected={selected}
              className={`${styles.previewTab} ${selected ? styles.previewTabActive : ""}`}
              onClick={() => setActiveSlug(segment.slug)}
            >
              <Icon className={styles.icon} weight="regular" />
              {segment.navTitle}
            </button>
          );
        })}
      </div>

      <div className={styles.previewBody}>
        <div className={styles.metricGrid}>
          {visual.metrics.map((metric) => (
            <div key={metric.label} className={styles.metricTile}>
              <strong>{metric.value}</strong>
              <span>{metric.label}</span>
              <p>{metric.detail}</p>
            </div>
          ))}
        </div>

        <div className={styles.previewColumns}>
          <div className={styles.previewList}>
            {visual.primaryRows.map((row) => (
              <div key={row.label} className={styles.previewRow}>
                <span>{row.label}</span>
                <strong>{row.value}</strong>
                <p>{row.meta}</p>
              </div>
            ))}
          </div>

          <div className={styles.previewList}>
            {visual.secondaryRows.map((row) => {
              const Icon = toneIcon[row.tone];

              return (
                <div key={row.label} className={styles.statusRow}>
                  <Icon className={styles.icon} weight="regular" />
                  <span>{row.label}</span>
                  <strong>{row.value}</strong>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </aside>
  );
}
