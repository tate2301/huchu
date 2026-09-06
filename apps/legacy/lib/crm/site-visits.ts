/**
 * Site-visit report capture.
 *
 * A site visit is where the job is actually specified: what is being measured,
 * in what condition, with what constraints. Everything captured here is shaped
 * so it converts straight into quotation lines — the rep should never re-key
 * measurements into a quote.
 */
import { z } from "zod";

import type { CrmDocumentLineInput } from "@/lib/crm/accounting-bridge";

export type SiteVisitChecklistDefault = {
  key: string;
  label: string;
  hint?: string;
};

/**
 * The default on-site checklist. Stored per-visit (not by reference) so
 * historical reports stay readable if this list later changes.
 */
export const DEFAULT_SITE_VISIT_CHECKLIST: SiteVisitChecklistDefault[] = [
  { key: "client_present", label: "Client or representative present" },
  { key: "access_confirmed", label: "Site access confirmed", hint: "Gates, keys, permits, working hours" },
  { key: "measurements_taken", label: "All measurements taken and double-checked" },
  { key: "photos_captured", label: "Photos captured of every work area" },
  { key: "power_available", label: "Power and water available on site" },
  { key: "obstructions_noted", label: "Obstructions and hazards noted" },
  { key: "existing_condition", label: "Condition of existing structure assessed" },
  { key: "scope_agreed", label: "Scope of work discussed and agreed verbally" },
];

export const siteVisitChecklistItemSchema = z.object({
  key: z.string().trim().min(1).max(60),
  label: z.string().trim().min(1).max(160),
  checked: z.boolean(),
  notes: z.string().trim().max(500).nullable().optional(),
});

export const siteVisitPhotoSchema = z.object({
  url: z.string().url().max(1000),
  fileName: z.string().trim().max(255).nullable().optional(),
  contentType: z.string().trim().max(120).nullable().optional(),
  size: z.number().finite().nonnegative().nullable().optional(),
  kind: z.enum(["PHOTO", "FILE"]).default("PHOTO"),
  caption: z.string().trim().max(300).nullable().optional(),
});

export const siteVisitItemSchema = z.object({
  category: z.string().trim().max(80).nullable().optional(),
  description: z.string().trim().min(1).max(300),
  quantity: z.number().finite().positive(),
  unit: z.string().trim().max(20).nullable().optional(),
  widthMm: z.number().finite().nonnegative().nullable().optional(),
  heightMm: z.number().finite().nonnegative().nullable().optional(),
  depthMm: z.number().finite().nonnegative().nullable().optional(),
  specNotes: z.string().trim().max(500).nullable().optional(),
  unitPrice: z.number().finite().nonnegative().nullable().optional(),
});

export type SiteVisitItemInput = z.infer<typeof siteVisitItemSchema>;

export const siteVisitReportSchema = z.object({
  checklist: z.array(siteVisitChecklistItemSchema).max(40).optional(),
  photos: z.array(siteVisitPhotoSchema).max(40).optional(),
  siteConditions: z.string().trim().max(4000).nullable().optional(),
  reportNotes: z.string().trim().max(4000).nullable().optional(),
  outcomeNotes: z.string().trim().max(4000).nullable().optional(),
  items: z.array(siteVisitItemSchema).max(200).optional(),
  /** Close the visit out: sets status COMPLETED and stamps the report. */
  markCompleted: z.boolean().optional(),
});

export type SiteVisitReportInput = z.infer<typeof siteVisitReportSchema>;

/** Human-readable dimension string, e.g. "1200 × 1500 mm" or "1200 × 1500 × 300 mm". */
export function formatDimensions(item: {
  widthMm?: number | null;
  heightMm?: number | null;
  depthMm?: number | null;
}): string | null {
  const parts = [item.widthMm, item.heightMm, item.depthMm].filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0,
  );
  if (parts.length < 2) return null;
  return `${parts.join(" × ")} mm`;
}

/**
 * Compose the quotation line description a client will actually read, e.g.
 * "Windows: Aluminium sliding window (1200 × 1500 mm) — powder-coated, 6mm glass".
 */
export function composeItemDescription(item: {
  category?: string | null;
  description: string;
  widthMm?: number | null;
  heightMm?: number | null;
  depthMm?: number | null;
  specNotes?: string | null;
}): string {
  const category = item.category?.trim();
  const dimensions = formatDimensions(item);
  const specNotes = item.specNotes?.trim();

  let text = item.description.trim();
  if (category) text = `${category}: ${text}`;
  if (dimensions) text = `${text} (${dimensions})`;
  if (specNotes) text = `${text} — ${specNotes}`;
  // Quotation line descriptions are capped at 300 characters server-side.
  return text.length > 300 ? `${text.slice(0, 297)}...` : text;
}

/**
 * Convert captured site-visit items into quotation lines. Items priced on site
 * carry their estimate through; unpriced ones arrive at zero for the rep to
 * fill in, which is the common case when pricing is decided back at the office.
 */
export function visitItemsToQuotationLines(
  items: Array<{
    category?: string | null;
    description: string;
    quantity: number;
    widthMm?: number | null;
    heightMm?: number | null;
    depthMm?: number | null;
    specNotes?: string | null;
    unitPrice?: number | null;
  }>,
): CrmDocumentLineInput[] {
  return items
    .filter((item) => item.description.trim().length > 0 && item.quantity > 0)
    .map((item) => ({
      description: composeItemDescription(item),
      quantity: item.quantity,
      unitPrice: item.unitPrice ?? 0,
    }));
}

/** Seed a fresh checklist from the defaults, all unchecked. */
export function buildDefaultChecklist() {
  return DEFAULT_SITE_VISIT_CHECKLIST.map((entry) => ({
    key: entry.key,
    label: entry.label,
    checked: false,
    notes: null as string | null,
  }));
}
