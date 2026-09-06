/**
 * The one text format notes, comments and descriptions are written in.
 *
 * Three constraints shaped this. It has to keep working with the mentions
 * already in the database, which are written `@[Name](uuid)`. It has to be
 * readable as-is, because a body that only makes sense through a renderer is a
 * body nobody can grep, export, or read in an email. And it has to reference
 * records, not just people — half of what somebody writes on a deal is about
 * another deal, a site, or the company behind both.
 *
 * So: plain text, a small markdown subset for emphasis, and one reference
 * token that covers people and records alike. No document tree, no JSON blob.
 * A rich editor that stores something unreadable buys formatting at the cost
 * of every other thing you might want to do with the words later.
 */

import { recordType } from "@/lib/records/registry";

export const REFERENCE_KINDS = [
  "user",
  "person",
  "company",
  "lead",
  "deal",
  "site",
  "quotation",
  "invoice",
  "receipt",
  // Schools (S-4.5). A note on a pupil that says "sat with @[Form 2 Blue]" is
  // the same idea as a note on a deal that names the company behind it: half of
  // what somebody writes about a record is about a neighbouring one. Only people
  // are notified — referring to a class is a link, not a summons.
  "student",
  "guardian",
  "teacher",
  "class",
  "subject",
  "hostel",
] as const;
export type ReferenceKind = (typeof REFERENCE_KINDS)[number];

export type Reference = {
  kind: ReferenceKind;
  id: string;
  label: string;
};

/**
 * `@[Label](kind:id)`, or `@[Name](uuid)` for the mentions already written.
 *
 * The bare-uuid form has to keep meaning "a person" forever: those rows exist,
 * they notified somebody, and rewriting history to add a prefix would be a
 * migration that buys nothing.
 */
const REFERENCE_PATTERN =
  /@\[([^\]]+)\]\((?:([a-z]+):)?([0-9a-fA-F-]{36})\)/g;

function isReferenceKind(value: string): value is ReferenceKind {
  return (REFERENCE_KINDS as readonly string[]).includes(value);
}

export type RichSegment =
  | { kind: "text"; text: string }
  | { kind: "reference"; reference: Reference };

/** Split a body into prose and references so a renderer can style them. */
export function segmentRichText(body: string): RichSegment[] {
  const segments: RichSegment[] = [];
  let lastIndex = 0;

  for (const match of body.matchAll(REFERENCE_PATTERN)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      segments.push({ kind: "text", text: body.slice(lastIndex, index) });
    }

    const rawKind = match[2];
    const kind: ReferenceKind =
      rawKind && isReferenceKind(rawKind) ? rawKind : "user";

    segments.push({
      kind: "reference",
      reference: { kind, id: match[3], label: match[1] },
    });
    lastIndex = index + match[0].length;
  }

  if (lastIndex < body.length) {
    segments.push({ kind: "text", text: body.slice(lastIndex) });
  }
  return segments;
}

export function extractReferences(body: string): Reference[] {
  const seen = new Set<string>();
  const references: Reference[] = [];

  for (const segment of segmentRichText(body)) {
    if (segment.kind !== "reference") continue;
    const key = `${segment.reference.kind}:${segment.reference.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    references.push(segment.reference);
  }

  return references;
}

/** Only the people, for the notification pass. */
export function extractMentionedUserIds(body: string): string[] {
  return extractReferences(body)
    .filter((reference) => reference.kind === "user")
    .map((reference) => reference.id);
}

/** The body as somebody would read it aloud — for previews and search. */
export function toPlainText(body: string): string {
  return segmentRichText(body)
    .map((segment) =>
      segment.kind === "reference" ? `@${segment.reference.label}` : segment.text,
    )
    .join("")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1$2")
    .replace(/`([^`]+)`/g, "$1");
}

export function referenceToken(reference: Reference): string {
  // Users keep the short form so old and new bodies are byte-identical for the
  // same mention, and nothing has to be migrated.
  return reference.kind === "user"
    ? `@[${reference.label}](${reference.id})`
    : `@[${reference.label}](${reference.kind}:${reference.id})`;
}

/** Put a reference in at the caret, replacing the `@query` typed so far. */
export function insertReference(
  body: string,
  caret: number,
  query: string,
  reference: Reference,
): { body: string; caret: number } {
  const start = caret - query.length - 1; // include the "@"
  const token = `${referenceToken(reference)} `;
  const next = body.slice(0, Math.max(0, start)) + token + body.slice(caret);
  return { body: next, caret: Math.max(0, start) + token.length };
}

/**
 * The partial `@query` immediately before the caret, or null when the caret is
 * not in one. Stops at whitespace so an email address mid-sentence does not
 * open the picker, and at `[` so a completed reference does not reopen it.
 */
export function activeReferenceQuery(body: string, caret: number): string | null {
  const before = body.slice(0, caret);
  const at = before.lastIndexOf("@");
  if (at === -1) return null;

  const query = before.slice(at + 1);
  if (/\s/.test(query)) return null;
  if (query.startsWith("[")) return null;
  return query;
}

/**
 * Wrap or unwrap the selection with a marker.
 *
 * Toggling matters more than it looks: a bold button that only ever adds
 * asterisks turns a second click into `****text****`, and the person who did
 * that has to go and delete them by hand.
 */
export function toggleMarker(
  body: string,
  start: number,
  end: number,
  marker: string,
): { body: string; start: number; end: number } {
  const selected = body.slice(start, end);
  if (!selected) {
    const next = body.slice(0, start) + marker + marker + body.slice(start);
    const caret = start + marker.length;
    return { body: next, start: caret, end: caret };
  }

  const already =
    body.slice(Math.max(0, start - marker.length), start) === marker &&
    body.slice(end, end + marker.length) === marker;

  if (already) {
    const next =
      body.slice(0, start - marker.length) + selected + body.slice(end + marker.length);
    return { body: next, start: start - marker.length, end: end - marker.length };
  }

  const next = body.slice(0, start) + marker + selected + marker + body.slice(end);
  return { body: next, start: start + marker.length, end: end + marker.length };
}

/** Put a line prefix — `- `, `> `, `1. ` — on every selected line. */
export function togglePrefix(
  body: string,
  start: number,
  end: number,
  prefix: string,
): { body: string; start: number; end: number } {
  const lineStart = body.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
  const lineEndIndex = body.indexOf("\n", end);
  const lineEnd = lineEndIndex === -1 ? body.length : lineEndIndex;

  const block = body.slice(lineStart, lineEnd);
  const lines = block.split("\n");
  const allPrefixed = lines.every((line) => line.startsWith(prefix));

  const next = lines
    .map((line) => (allPrefixed ? line.slice(prefix.length) : prefix + line))
    .join("\n");

  const delta = next.length - block.length;
  return {
    body: body.slice(0, lineStart) + next + body.slice(lineEnd),
    start: lineStart,
    end: end + delta,
  };
}

/**
 * Inline emphasis, parsed once so the renderer does not have to.
 *
 * Deliberately three markers. Every one you add is another sequence somebody
 * types by accident and then has to escape, and nobody has ever asked a CRM
 * note for a footnote.
 */
export type InlineToken =
  | { kind: "text"; text: string }
  | { kind: "bold"; text: string }
  | { kind: "italic"; text: string }
  | { kind: "code"; text: string };

const INLINE_PATTERN = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`)/g;

export function parseInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(INLINE_PATTERN)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      tokens.push({ kind: "text", text: text.slice(lastIndex, index) });
    }

    const raw = match[0];
    if (raw.startsWith("**")) {
      tokens.push({ kind: "bold", text: raw.slice(2, -2) });
    } else if (raw.startsWith("`")) {
      tokens.push({ kind: "code", text: raw.slice(1, -1) });
    } else {
      tokens.push({ kind: "italic", text: raw.slice(1, -1) });
    }

    lastIndex = index + raw.length;
  }

  if (lastIndex < text.length) {
    tokens.push({ kind: "text", text: text.slice(lastIndex) });
  }
  return tokens;
}

/** Where a reference points. Null for kinds with no page of their own. */
export function referenceHref(reference: Reference): string | null {
  switch (reference.kind) {
    case "user":
      return `/crm/reps/${reference.id}`;
    case "person":
      return `/crm/people/${reference.id}`;
    case "company":
      return `/crm/companies/${reference.id}`;
    case "lead":
      return `/crm/leads/${reference.id}`;
    case "deal":
      return `/crm/deals/${reference.id}`;
    case "site":
      return `/crm/sites/${reference.id}`;
    case "quotation":
      return `/crm/quotes/${reference.id}`;
    case "invoice":
      return `/crm/invoices/${reference.id}`;
    case "receipt":
      return `/crm/receipts/${reference.id}`;
    // Through the record registry rather than written out again: S-4.3 already
    // decided where a student record lives, and a second copy of that answer is
    // a broken link waiting for the first route change.
    case "student":
      return recordType("STUDENT").href(reference.id);
    case "guardian":
      return recordType("GUARDIAN").href(reference.id);
    case "teacher":
      return recordType("TEACHER").href(reference.id);
    case "class":
      return recordType("CLASS").href(reference.id);
    case "subject":
      return recordType("SUBJECT").href(reference.id);
    case "hostel":
      return recordType("HOSTEL").href(reference.id);
    default:
      return null;
  }
}

/** Map a global-search result type onto a reference kind. */
export function referenceKindFromSearchType(type: string): ReferenceKind | null {
  const lowered = type.trim().toLowerCase();
  if (lowered === "customer") return "company";
  if (lowered === "product") return null;
  return isReferenceKind(lowered) ? lowered : null;
}

/**
 * A one-line, plain-text reading of a body — for a timeline subject, a
 * notification, a search snippet, anywhere the words have to survive without
 * the renderer.
 *
 * References collapse to their labels (`@[Sarah](uuid)` → `Sarah`) and the
 * emphasis markers go, because a subject line showing `**urgent**` is the
 * failure this exists to prevent.
 */
export function richTextToPlain(body: string, maxLength = 200): string {
  const flattened = segmentRichText(body)
    .map((segment) => (segment.kind === "reference" ? segment.reference.label : segment.text))
    .join("");

  const stripped = flattened
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/^>\s?/gm, "")
    .replace(/\s+/g, " ")
    .trim();

  if (stripped.length <= maxLength) return stripped;
  return `${stripped.slice(0, maxLength - 1).trimEnd()}…`;
}
