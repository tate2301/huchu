import type { CrmKnowledgeEntryKind, PrismaClient } from "@prisma/client";
import { z } from "zod";

/**
 * What the business knows, in its own words (CRM → Knowledge): FAQs (a
 * question people ask and its answer), facts about the business, and tips for
 * doing the work well. A person writes one, keeps an answer Vane gave as one,
 * or keeps one Vane found in a document. Vane answers from kept entries first.
 */

export const ENTRY_KINDS = ["FAQ", "FACT", "TIP"] as const;

export const ENTRY_WORDS: Record<CrmKnowledgeEntryKind, { one: string; many: string; title: string; body: string }> = {
  FAQ: { one: "FAQ", many: "FAQs", title: "Question", body: "Answer" },
  FACT: { one: "fact", many: "Facts", title: "The fact, in a line", body: "More about it" },
  TIP: { one: "tip", many: "Tips", title: "The tip, in a line", body: "How, and why" },
};

export const entryInputSchema = z.object({
  kind: z.enum(ENTRY_KINDS),
  title: z.string().trim().min(3, "Write it in a few words").max(300),
  body: z.string().trim().min(1, "Say a little more").max(5000),
});
export type EntryInput = z.infer<typeof entryInputSchema>;

export type KnowledgeEntryView = {
  id: string;
  kind: CrmKnowledgeEntryKind;
  title: string;
  body: string;
  kept: boolean;
  madeByVane: boolean;
  /** The document it came from, when Vane found it in one. */
  doc: { id: string; title: string } | null;
  source: string | null;
  by: string | null;
  updatedAt: string;
};

type Db = Pick<PrismaClient, "crmKnowledgeEntry">;

const SELECT = {
  id: true,
  kind: true,
  title: true,
  body: true,
  kept: true,
  madeByVane: true,
  source: true,
  updatedAt: true,
  doc: { select: { id: true, title: true } },
  createdBy: { select: { name: true } },
} as const;

type Row = { id: string; kind: CrmKnowledgeEntryKind; title: string; body: string; kept: boolean; madeByVane: boolean; source: string | null; updatedAt: Date; doc: { id: string; title: string } | null; createdBy: { name: string | null } | null };

const toView = (row: Row): KnowledgeEntryView => ({
  id: row.id,
  kind: row.kind,
  title: row.title,
  body: row.body,
  kept: row.kept,
  madeByVane: row.madeByVane,
  doc: row.doc,
  source: row.source,
  by: row.madeByVane && !row.createdBy ? "Vane" : (row.createdBy?.name ?? null),
  updatedAt: row.updatedAt.toISOString(),
});

/** Every entry, kept first and newest first; or one document's. */
export async function listEntries(db: Db, companyId: string, where: { docId?: string } = {}): Promise<KnowledgeEntryView[]> {
  const rows = await db.crmKnowledgeEntry.findMany({ where: { companyId, ...where }, orderBy: [{ kept: "asc" }, { updatedAt: "desc" }], select: SELECT });
  // Waiting ones (not kept) first: they are what wants a decision.
  return rows.map(toView);
}

/** A person writes an entry, or keeps an answer Vane gave as one: it is theirs and kept. */
export async function addEntry(db: Db, who: { companyId: string; userId: string }, input: EntryInput) {
  const row = await db.crmKnowledgeEntry.create({ data: { companyId: who.companyId, createdById: who.userId, kept: true, ...input }, select: SELECT });
  return toView(row);
}

/** A person changes an entry: what Vane found becomes theirs once they have changed it. */
export async function editEntry(db: Db, who: { companyId: string; userId: string }, id: string, input: EntryInput) {
  const { count } = await db.crmKnowledgeEntry.updateMany({ where: { id, companyId: who.companyId }, data: { ...input, kept: true, createdById: who.userId } });
  return count;
}

/** Keeps the entries Vane found, or lets them go; or removes one, kept or not. */
export async function decideEntries(db: Db, companyId: string, ids: string[], keep: boolean) {
  const where = { companyId, id: { in: ids }, kept: false };
  const { count } = keep ? await db.crmKnowledgeEntry.updateMany({ where, data: { kept: true } }) : await db.crmKnowledgeEntry.deleteMany({ where });
  return count;
}

export async function removeEntry(db: Db, companyId: string, id: string) {
  const { count } = await db.crmKnowledgeEntry.deleteMany({ where: { companyId, id } });
  return count;
}
