"use client";

import { useMemo } from "react";

import { ClientDate } from "@/components/ui/client-date";

import styles from "./builder.module.css";

/**
 * What this document has actually done.
 *
 * A template's counters are the only honest answer to "is this form working".
 * Opens without submissions is a form that asks too much; submissions without
 * opens means somebody is posting to it directly, which is worth knowing too.
 *
 * It used to draw the event list as well, under the counters. The record now
 * gets its trail from the shared `ActivityTrail`, so keeping a second list
 * here would have been the same events twice on one screen, in two different
 * shapes — which is worse than either shape alone.
 */
export function TemplateAnalytics({
  viewCount,
  submitCount,
  lastViewedAt,
  lastSubmitAt,
}: {
  viewCount: number;
  submitCount: number;
  lastViewedAt: string | null;
  lastSubmitAt: string | null;
}) {
  const completion = useMemo(() => {
    if (viewCount === 0) return null;
    return Math.round((submitCount / viewCount) * 100);
  }, [submitCount, viewCount]);

  return (
    <dl className={styles.stats}>
      <div className={styles.stat}>
        <dt>Opened</dt>
        <dd>{viewCount}</dd>
        <dd className={styles.statWhen}>
          {lastViewedAt ? (
            <>
              Last <ClientDate value={lastViewedAt} mode="datetime" />
            </>
          ) : (
            "Nobody has opened it"
          )}
        </dd>
      </div>

      <div className={styles.stat}>
        <dt>Filled in</dt>
        <dd>{submitCount}</dd>
        <dd className={styles.statWhen}>
          {lastSubmitAt ? (
            <>
              Last <ClientDate value={lastSubmitAt} mode="datetime" />
            </>
          ) : (
            "No submissions yet"
          )}
        </dd>
      </div>

      <div className={styles.stat}>
        <dt>Completion</dt>
        <dd>{completion === null ? "—" : `${completion}%`}</dd>
        <dd className={styles.statWhen}>
          {completion === null ? "Needs an open to measure" : "Of the people who opened it"}
        </dd>
      </div>
    </dl>
  );
}
