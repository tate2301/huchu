"use client";

import type { ReactNode } from "react";

import {
  CardsSkeleton,
  LoadError,
  RecordNotFound,
  StatsSkeleton,
} from "@/components/schools/common/states";
import { ApiError } from "@/lib/api-client";

/**
 * The three things every campus record page does around its own content.
 *
 * There are six of them — pupil, guardian, teacher, class, subject, hostel —
 * and each had written its own version of all three. They had already drifted:
 * three drew a record-shaped skeleton while three put up two grey slabs, and
 * three told a stale link apart from a broken server while three answered
 * "that record is not here" to both. A fix landed on one page and the report
 * came back saying it was not there, correctly.
 *
 * So they live here, once, and a record page is left with the part that is
 * genuinely about its own nouns.
 */

/**
 * A figure in the record's rail.
 *
 * Label left, value right, on one baseline — the artboard's glance list. Kept
 * for the facts a section rail cannot carry: a yes/no, a free bed count, a
 * subject with nobody against it. Anything that is simply how many rows a
 * section holds belongs on that section, which already draws its own count.
 */
export function Glance({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[var(--text-muted)]">{label}</dt>
      <dd className="font-medium text-[var(--text-strong)]">{value}</dd>
    </div>
  );
}

/** The rail's glance list. A `<dl>` with the rows' own spacing. */
export function GlanceList({ children }: { children: ReactNode }) {
  return <dl className="space-y-2 text-sm">{children}</dl>;
}

/**
 * The record's own shape, while it is being read.
 *
 * The standing column carries the mark, the name and a column of property
 * rows; the pane beside it carries the landing section. Two grey slabs stood
 * in for both, so the page reflowed twice and jumped its columns as the real
 * ones arrived — the failure a skeleton exists to prevent, drawn as a
 * skeleton.
 */
export function RecordPageSkeleton({
  testId,
  /** How many cards the landing section lays out. A roll is denser than a hostel. */
  sections = 4,
  columns = 2,
}: {
  testId?: string;
  sections?: number;
  columns?: 1 | 2;
}) {
  return (
    <div
      className="grid items-start gap-4 xl:grid-cols-[320px_minmax(0,1fr)]"
      data-testid={testId}
    >
      <div className="space-y-4">
        <CardsSkeleton count={1} columns={1} lines={8} />
        <StatsSkeleton count={3} />
      </div>
      <CardsSkeleton count={sections} columns={columns} lines={4} />
    </div>
  );
}

/**
 * A record that did not arrive, answered by which of the two happened.
 *
 * A 404 is a stale link or an archived record and the way on is the list it
 * came from; anything else is a fault and the way on is to try again. Reading
 * them as one thing sends somebody back to the roll to look for a pupil who is
 * still there.
 */
export function RecordLoadFailure({
  notFound,
  what,
  error,
  backHref,
  backLabel,
  onRetry,
}: {
  /** The record, as a stale link leaves it: "That pupil", "That hostel". */
  notFound: string;
  /** What would not load, as a noun phrase: "this pupil's record". */
  what: string;
  error: unknown;
  backHref: string;
  backLabel: string;
  onRetry?: () => void;
}) {
  // No error at all means the read succeeded and answered with nothing, which
  // for a record by id is the same fact a 404 states.
  if (!error || (error instanceof ApiError && error.status === 404)) {
    return <RecordNotFound what={notFound} backHref={backHref} backLabel={backLabel} />;
  }
  return <LoadError what={what} error={error} onRetry={onRetry} />;
}
