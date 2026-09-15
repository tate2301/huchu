import type { RecordEntity } from "@/lib/crm/record-ref";

/**
 * What a glance at a record looks like, whichever module the record came from.
 *
 * `components/records/record-peek.tsx` draws one panel for every record type in
 * the product, so there is exactly one shape for it to draw: a title, a
 * reference, where the record stands, a supporting line, a short ordered list
 * of properties, and whether the record has been taken off the list. Each
 * module answers from its own tables and in its own words; none of them answers
 * in its own shape.
 *
 * Here rather than beside the endpoint that was written first, because the
 * second module to answer the question would otherwise copy the type — and a
 * copy is how the panel ends up rendering a field one of the two has quietly
 * stopped sending.
 *
 * The properties are deliberately strings. A peek that renders a live editor
 * for a dozen entity types is a second record page with a worse layout, and two
 * places to edit one fact is how they drift apart.
 */

export type PeekTone = "neutral" | "info" | "success" | "warn" | "danger";

export type PeekSummary = {
  entity: RecordEntity;
  id: string;
  href: string;
  title: string;
  /** CRMD-0142, DEAL-0039, the admission number — what people quote at each other. */
  reference: string | null;
  /** Where it stands, when that means anything for this entity. */
  status: { label: string; tone: PeekTone } | null;
  /** The line under the title: a company, a job title, a form room. */
  subtitle: string | null;
  properties: Array<{ label: string; value: string }>;
  /** Archived records are still reachable by link, and should say so. */
  archived: boolean;
};

/** Drop the properties that have no answer rather than printing "—" five times. */
export function kept(
  rows: Array<{ label: string; value: string | null | undefined }>,
): Array<{ label: string; value: string }> {
  return rows.filter((row): row is { label: string; value: string } => Boolean(row.value));
}

/**
 * A figure with the currency it was billed or quoted in, never converted.
 *
 * Shared with the properties themselves so that a sum of money reads the same
 * in a peek at a deal and in a peek at what a family owes.
 */
export function money(
  value: number | null | undefined,
  currency: string | null | undefined,
): string | null {
  return value == null
    ? null
    : `${currency ?? "USD"} ${value.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
}

/** A date, as a date. The peek is a glance and never needs the time of day. */
export function day(value: Date | null | undefined): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}
