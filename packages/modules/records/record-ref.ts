/**
 * Turning a link back into the record it points at.
 *
 * Every reference on a record page is already a real href — that was the easy
 * half of "records are a graph". The half that needs this is looking at the
 * other end of an edge *without* travelling down it: a peek has to know that
 * `/crm/companies/abc` means the company `abc` before it can fetch anything,
 * and the only thing it is ever handed is the href the link already carries.
 *
 * Pure, and separate from the components, because "which hrefs are records"
 * is a fact about the routing table rather than about any one panel — and
 * because the peek's whole behaviour turns on it, so it is worth testing on
 * its own.
 */

export const RECORD_ENTITIES = [
  "lead",
  "deal",
  "company",
  "person",
  "site",
  "rep",
] as const;

export type RecordEntity = (typeof RECORD_ENTITIES)[number];

/** The path segment each entity lives under. */
const SEGMENT: Record<RecordEntity, string> = {
  lead: "leads",
  deal: "deals",
  company: "companies",
  person: "people",
  site: "sites",
  rep: "reps",
};

const BY_SEGMENT = new Map<string, RecordEntity>(
  RECORD_ENTITIES.map((entity) => [SEGMENT[entity], entity]),
);

export type RecordRef = { entity: RecordEntity; id: string };

/**
 * `/crm/deals/abc?section=documents` → `{ entity: "deal", id: "abc" }`.
 *
 * Anything else — a list page, a link off to another module, an external URL,
 * a deeper path like `/crm/deals/abc/edit` — returns null, and the caller
 * treats the link as an ordinary link. Being strict here is what keeps the
 * peek from opening on things it cannot summarise.
 */
export function parseRecordHref(href: string | null | undefined): RecordRef | null {
  if (!href || !href.startsWith("/crm/")) return null;

  // Drop the query and hash: `?section=` and `#anchor` say where to look
  // *inside* a record, which does not change which record it is.
  const path = href.split(/[?#]/)[0];
  const parts = path.split("/").filter(Boolean);

  // ["crm", <segment>, <id>] and nothing after it.
  if (parts.length !== 3) return null;

  const entity = BY_SEGMENT.get(parts[1]);
  if (!entity) return null;

  const id = decodeURIComponent(parts[2]);
  if (!id) return null;

  return { entity, id };
}

/** The canonical page for a record, which is where "open in full" goes. */
export function recordHref(ref: RecordRef): string {
  return `/crm/${SEGMENT[ref.entity]}/${ref.id}`;
}

/** Two refs pointing at the same record. */
export function sameRecord(a: RecordRef | null, b: RecordRef | null): boolean {
  return Boolean(a && b && a.entity === b.entity && a.id === b.id);
}

/** The word for an entity, for a heading or a fallback label. */
export const ENTITY_LABEL: Record<RecordEntity, string> = {
  lead: "Lead",
  deal: "Deal",
  company: "Company",
  person: "Person",
  site: "Site",
  rep: "Rep",
};
