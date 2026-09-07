import { z } from "zod";

/**
 * Files that belong to a record.
 *
 * The CRM could already raise a quote and could already photograph a site
 * visit, and between those two there was nowhere to put the signed contract,
 * the tax clearance certificate or the scan of the customer's purchase order.
 * Those arrived by email and stayed there, which is to say they were held by
 * whoever happened to receive them.
 *
 * The owner WAS one nullable column per kind, so the database enforced that the
 * record existed and cascaded a delete. That bought a real guarantee and cost a
 * wider table — and it meant only a kind with a column could own a file, which
 * is why S-4.2 moved the storage to a `(subjectType, subjectId)` pair in
 * `lib/records/subject.ts`. The columns are still written and still read until
 * they are dropped.
 *
 * `ownerColumn` and `ownerWhere` remain because they still describe the legacy
 * side truthfully and are still tested. New code should reach for `subjectData`
 * and `subjectWhere` instead, which handle both schemes.
 */

export const FILE_OWNERS = [
  "lead",
  "deal",
  "company",
  "person",
  "site",
  "rep",
  // S-4.2 — school records can own a file now that the subject is not a column.
  "student",
  "guardian",
  "teacher",
  "class",
  "subject",
  "hostel",
] as const;
export type FileOwnerKind = (typeof FILE_OWNERS)[number];

export type FileOwner = { kind: FileOwnerKind; id: string };

export const fileOwnerSchema = z.object({
  owner: z.enum(FILE_OWNERS),
  ownerId: z.string().uuid(),
});

export const recordFileSchema = z.object({
  owner: z.enum(FILE_OWNERS),
  ownerId: z.string().uuid(),
  name: z.string().trim().min(1).max(300),
  url: z.string().trim().url().max(2000),
  size: z.number().int().min(0).max(2_000_000_000).nullish(),
  contentType: z.string().trim().max(200).nullish(),
  note: z.string().trim().max(500).nullish(),
});

export type RecordFileInput = z.infer<typeof recordFileSchema>;

/**
 * The column this owner writes to.
 *
 * A rep is a User rather than a CRM record — the profile page is a person who
 * works here, not a person we sell to — so it gets its own column instead of
 * being squeezed into `personId` and quietly colliding with a customer contact
 * of the same name.
 */
export function ownerColumn(owner: FileOwnerKind): string | null {
  switch (owner) {
    case "lead":
      return "leadId";
    case "deal":
      return "dealId";
    case "company":
      return "clientId";
    case "person":
      return "personId";
    case "site":
      return "siteId";
    case "rep":
      return "userId";
    default:
      // A school record never had a column and never will — its subject lives
      // only in the pair. Null rather than a throw, because a caller asking
      // "which legacy column?" about a student has a legitimate answer: none.
      return null;
  }
}

/**
 * The legacy `where`/`data` fragment for one owner, or `{}` when the owner never
 * had a column. Prefer `subjectWhere`/`subjectData` in new code.
 */
export function ownerWhere(owner: FileOwner): Record<string, string> {
  const column = ownerColumn(owner.kind);
  return column ? { [column]: owner.id } : {};
}
