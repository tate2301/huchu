/**
 * Comments and followers, shared across every CRM record type.
 *
 * Both features answer the same question — "who is talking about this record,
 * and who wants to hear about it" — so they share one way of naming a record
 * rather than each inventing their own.
 */
import type { CrmFieldEntity, Prisma } from "@corelithzw/db";
import { z } from "zod";

import { recordType } from "@/lib/records/registry";

/**
 * The record types people discuss.
 *
 * Was five, because a comment's subject was one of five nullable columns and
 * nothing else could be named. S-4.2 moved the storage to a
 * `(subjectType, subjectId)` pair, so the limit is gone and the six school types
 * join. Work orders still do not, because nothing renders a work-order record
 * page yet.
 */
export const COLLAB_ENTITIES = [
  "LEAD",
  "DEAL",
  "COMPANY",
  "PERSON",
  "SITE",
  "STUDENT",
  "GUARDIAN",
  "TEACHER",
  "CLASS",
  "SUBJECT",
  "HOSTEL",
] as const;
export type CollabEntity = (typeof COLLAB_ENTITIES)[number];

export const collabRecordSchema = z.object({
  entity: z.enum(COLLAB_ENTITIES),
  recordId: z.string().uuid(),
});
export type CollabRecord = z.infer<typeof collabRecordSchema>;

/**
 * Comments store the record as one of five nullable columns rather than an
 * entity/id pair, so the database can cascade a delete and so a record page
 * reads its thread through an index instead of a scan.
 */
export function commentRecordColumns(record: CollabRecord): {
  leadId?: string;
  dealId?: string;
  clientId?: string;
  personId?: string;
  siteId?: string;
} {
  switch (record.entity) {
    case "LEAD":
      return { leadId: record.recordId };
    case "DEAL":
      return { dealId: record.recordId };
    case "COMPANY":
      return { clientId: record.recordId };
    case "PERSON":
      return { personId: record.recordId };
    case "SITE":
      return { siteId: record.recordId };
    default:
      // A school record never had a column. Its subject lives only in the pair,
      // which `subjectData` writes; there is nothing legacy to add here.
      return {};
  }
}

/** The same mapping as a where clause, with the other four pinned to null. */
export function commentRecordWhere(record: CollabRecord): Prisma.CrmCommentWhereInput {
  return {
    leadId: null,
    dealId: null,
    clientId: null,
    personId: null,
    siteId: null,
    ...commentRecordColumns(record),
  };
}

/**
 * Where a record lives in the UI, for notification deep links.
 *
 * Delegated to the record-type registry rather than kept as a second switch over
 * the same eleven types. A route that moves should move in one place, and this
 * function existing separately is how a notification ends up linking somewhere
 * that used to be a page.
 */
export function collabRecordPath(record: CollabRecord): string {
  return recordType(record.entity).href(record.recordId);
}

/**
 * Kept as a map rather than derived, because these are the words a NOTIFICATION
 * uses — "commented on a lead" — and the registry's labels are the words a page
 * heading uses. They agree today and are allowed to diverge.
 */
export const COLLAB_ENTITY_LABELS: Record<CollabEntity, string> = {
  LEAD: "Lead",
  DEAL: "Deal",
  COMPANY: "Company",
  PERSON: "Person",
  SITE: "Site",
  STUDENT: "Student",
  GUARDIAN: "Guardian",
  TEACHER: "Teacher",
  CLASS: "Class",
  SUBJECT: "Subject",
  HOSTEL: "Hostel",
};

/** `CollabEntity` is a subset of the field-definition entity enum. */
export function asFieldEntity(entity: CollabEntity): CrmFieldEntity {
  return entity as CrmFieldEntity;
}

export const createCommentSchema = collabRecordSchema.extend({
  body: z.string().trim().min(1).max(8000),
  parentId: z.string().uuid().nullable().optional(),
});

export const updateCommentSchema = z.object({
  body: z.string().trim().min(1).max(8000).optional(),
  isPinned: z.boolean().optional(),
  resolved: z.boolean().optional(),
});

/**
 * People who should hear about a comment: everyone following the record and
 * everyone already in the thread, minus whoever just wrote it and anyone
 * mentioned by name — a mention notice already says more than "new comment".
 */
export function commentAudience(params: {
  followerIds: string[];
  participantIds: string[];
  mentionedIds: string[];
  authorId: string;
}): string[] {
  const exclude = new Set([params.authorId, ...params.mentionedIds]);
  const audience = new Set<string>();
  for (const id of [...params.followerIds, ...params.participantIds]) {
    if (!exclude.has(id)) audience.add(id);
  }
  return Array.from(audience);
}

/**
 * A comment can only reply to a top-level comment on the same record. One
 * level of nesting keeps a thread readable; replies-to-replies do not.
 */
export function isValidParent(
  parent: { id: string; parentId: string | null; leadId: string | null; dealId: string | null; clientId: string | null; personId: string | null; siteId: string | null } | null,
  record: CollabRecord,
): boolean {
  if (!parent) return false;
  if (parent.parentId) return false;
  const columns = commentRecordColumns(record);
  return (
    parent.leadId === (columns.leadId ?? null) &&
    parent.dealId === (columns.dealId ?? null) &&
    parent.clientId === (columns.clientId ?? null) &&
    parent.personId === (columns.personId ?? null) &&
    parent.siteId === (columns.siteId ?? null)
  );
}
