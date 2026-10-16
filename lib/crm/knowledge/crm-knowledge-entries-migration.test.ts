/**
 * Migration witness for `20261016160000_crm_knowledge_entries`.
 *
 * An FAQ, fact or tip goes with the workspace, outlives the document it came
 * from and the person who wrote it, carries a full-text search column the
 * database keeps itself, indexed, and is under row security, so Vane's reader
 * and a rep's reading see only their own workspace's.
 */
import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

const onDelete = async (name: string) =>
  (
    await prisma.$queryRaw<Array<{ rule: string }>>`
      SELECT rc.delete_rule AS rule FROM information_schema.referential_constraints rc
      JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = rc.constraint_name
      WHERE kcu.table_name = 'CrmKnowledgeEntry' AND kcu.column_name = ${name}`
  )[0]?.rule ?? null;

describe("the knowledge base's FAQs, facts and tips, as stored", () => {
  it("goes with the workspace, and outlives its document and its writer", async () => {
    expect(await onDelete("companyId")).toBe("CASCADE");
    expect(await onDelete("docId")).toBe("SET NULL");
    expect(await onDelete("createdById")).toBe("SET NULL");
    const [kinds] = await prisma.$queryRaw<Array<{ values: string }>>`SELECT enum_range(NULL::"CrmKnowledgeEntryKind")::text AS values`;
    expect(kinds!.values).toBe("{FAQ,FACT,TIP}");
  });

  it("keeps a generated, indexed full-text search column", async () => {
    const [column] = await prisma.$queryRaw<Array<{ is_generated: string }>>`
      SELECT is_generated FROM information_schema.columns WHERE table_name = 'CrmKnowledgeEntry' AND column_name = 'search'`;
    expect(column).toEqual({ is_generated: "ALWAYS" });
    const [index] = await prisma.$queryRaw<Array<{ indexdef: string }>>`SELECT indexdef FROM pg_indexes WHERE indexname = 'CrmKnowledgeEntry_search_idx'`;
    expect(index?.indexdef).toContain("USING gin");
  });

  it("is under row security, read by Vane's reader and a rep's reading in their own workspace only", async () => {
    const [table] = await prisma.$queryRaw<Array<{ relrowsecurity: boolean }>>`SELECT relrowsecurity FROM pg_class WHERE relname = 'CrmKnowledgeEntry'`;
    expect(table).toEqual({ relrowsecurity: true });
    const policies = await prisma.$queryRaw<Array<{ policyname: string }>>`SELECT policyname FROM pg_policies WHERE tablename = 'CrmKnowledgeEntry' ORDER BY policyname`;
    expect(policies.map((row) => row.policyname)).toEqual(["app_all", "vane_rep", "vane_workspace"]);
  });
});
