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
 *
 * The routing table is `lib/records/registry.ts`, and this derives from it
 * rather than restating it. It used to carry its own list of six CRM entities
 * and refuse anything not under `/crm/`, which meant a school's records — in
 * the registry since S-4.3, with record pages of their own — were invisible to
 * it: every reference to a pupil was an ordinary link with no trail behind it.
 * A second list of what counts as a record was always going to drift from the
 * first, and had.
 */
import {
  RECORD_TYPES,
  recordType,
  type RecordType,
  type RecordTypeConfig,
} from "@/lib/records/registry";

/**
 * A record type, lower-cased.
 *
 * The registry names types in the shape the database uses (`STUDENT`); a peek's
 * query key, an API segment and a label all want the other one. Deriving it
 * keeps the two spellings from becoming two lists.
 */
export type RecordEntity = Lowercase<RecordType>;

export const RECORD_ENTITIES = RECORD_TYPES.map(
  (type) => type.toLowerCase() as RecordEntity,
);

function entityOf(type: RecordType): RecordEntity {
  return type.toLowerCase() as RecordEntity;
}

function configOf(entity: RecordEntity): RecordTypeConfig {
  return recordType(entity.toUpperCase() as RecordType);
}

/**
 * The path each type's record page sits under, taken from the registry's own
 * href builder so the two cannot disagree.
 *
 * A prefix rather than a segment: a class lives at
 * `/management/master-data/schools/classes/:id`, four segments deep, and the
 * old parser's "exactly three parts" rule would have refused it.
 *
 * The id is stood in for by a token no path contains, then cut back off, which
 * is how the prefix is read out of a builder that only knows how to make whole
 * hrefs.
 */
const ID_TOKEN = "--record-id--";

const PREFIX: Record<RecordEntity, string> = Object.fromEntries(
  RECORD_TYPES.map((type) => {
    const href = recordType(type).href(ID_TOKEN);
    return [entityOf(type), href.slice(0, href.indexOf(ID_TOKEN))];
  }),
) as Record<RecordEntity, string>;

/**
 * Longest prefix first, so that a type nested under another's path is matched
 * on its own terms rather than by whichever was declared first.
 */
const BY_PREFIX = RECORD_ENTITIES.slice().sort(
  (a, b) => PREFIX[b].length - PREFIX[a].length,
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
  if (!href || !href.startsWith("/")) return null;

  // Drop the query and hash: `?section=` and `#anchor` say where to look
  // *inside* a record, which does not change which record it is.
  const path = href.split(/[?#]/)[0];

  for (const entity of BY_PREFIX) {
    const prefix = PREFIX[entity];
    if (!path.startsWith(prefix)) continue;

    // The id, and nothing after it. A trailing segment is a sub-page, which is
    // a different thing from the record even when it is about it.
    const rest = path.slice(prefix.length);
    if (!rest || rest.includes("/")) return null;

    const id = decodeURIComponent(rest);
    if (!id) return null;

    return { entity, id };
  }

  return null;
}

/** The canonical page for a record, which is where "open in full" goes. */
export function recordHref(ref: RecordRef): string {
  return configOf(ref.entity).href(ref.id);
}

/**
 * Where a glance at this record is fetched from, or null when the type has no
 * summary endpoint.
 *
 * A link to such a record is still a record link — it knows what it points at
 * and it leaves a trail — it simply opens the page instead of a panel. Both
 * modules now answer: the CRM types from `/api/v2/crm/records/...` and the
 * school types from `/api/v2/schools/records/...`, in one shape.
 */
export function recordSummaryPath(ref: RecordRef): string | null {
  return configOf(ref.entity).summaryPath?.(ref.id) ?? null;
}

/** Whether a glance is possible without travelling to the record. */
export function isPeekable(ref: RecordRef | null | undefined): boolean {
  return Boolean(ref && configOf(ref.entity).summaryPath);
}

/** Two refs pointing at the same record. */
export function sameRecord(a: RecordRef | null, b: RecordRef | null): boolean {
  return Boolean(a && b && a.entity === b.entity && a.id === b.id);
}

/** The word for an entity, for a heading or a fallback label. */
export const ENTITY_LABEL: Record<RecordEntity, string> = Object.fromEntries(
  RECORD_TYPES.map((type) => [entityOf(type), recordType(type).label]),
) as Record<RecordEntity, string>;
