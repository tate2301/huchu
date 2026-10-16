/**
 * Migration witness for `20261016150000_crm_knowledge`.
 *
 * A knowledge document, its passages and its prices go with the workspace and
 * with the document; passages and prices carry a full-text search column the
 * database keeps itself, indexed; a quote line keeps the price it came from and
 * loses only that link when the price goes; a Vane answer keeps what it showed.
 * Vane's reader reads the knowledge base inside its workspace, and so does a
 * rep's reading.
 */
import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

const column = async (table: string, name: string) =>
  (
    await prisma.$queryRaw<Array<{ is_nullable: string; is_generated: string; column_default: string | null }>>`
      SELECT is_nullable, is_generated, column_default FROM information_schema.columns WHERE table_name = ${table} AND column_name = ${name}`
  )[0] ?? null;

const onDelete = async (table: string, name: string) =>
  (
    await prisma.$queryRaw<Array<{ rule: string }>>`
      SELECT rc.delete_rule AS rule FROM information_schema.referential_constraints rc
      JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = rc.constraint_name
      WHERE kcu.table_name = ${table} AND kcu.column_name = ${name}`
  )[0]?.rule ?? null;

const reads = async (role: string, table: string, name: string) =>
  (
    await prisma.$queryRaw<Array<{ n: bigint }>>`
      SELECT count(*) AS n FROM information_schema.column_privileges
      WHERE grantee = ${role} AND privilege_type = 'SELECT' AND table_name = ${table} AND column_name = ${name}`
  )[0]!.n > BigInt(0);

describe("the CRM's knowledge base, as stored", () => {
  it("files documents, passages and prices under the workspace and the document", async () => {
    for (const table of ["CrmKnowledgeDoc", "CrmKnowledgeChunk", "CrmKnowledgePrice"]) expect(await onDelete(table, "companyId")).toBe("CASCADE");
    expect(await onDelete("CrmKnowledgeChunk", "docId")).toBe("CASCADE");
    expect(await onDelete("CrmKnowledgePrice", "docId")).toBe("CASCADE");
    expect(await onDelete("CrmKnowledgeDoc", "uploadedById")).toBe("SET NULL");
    expect((await column("CrmKnowledgePrice", "kept"))?.column_default).toBe("true");
  });

  it("keeps a full-text search column on passages and prices, generated and indexed", async () => {
    for (const table of ["CrmKnowledgeChunk", "CrmKnowledgePrice"]) {
      expect(await column(table, "search")).toMatchObject({ is_generated: "ALWAYS" });
      const [index] = await prisma.$queryRaw<Array<{ indexdef: string }>>`SELECT indexdef FROM pg_indexes WHERE tablename = ${table} AND indexname = ${`${table}_search_idx`}`;
      expect(index?.indexdef).toContain("USING gin");
    }
  });

  it("keeps a quote line's knowledge price until the price goes, and what a Vane answer showed", async () => {
    expect(await column("SalesQuotationLine", "knowledgePriceId")).toMatchObject({ is_nullable: "YES" });
    expect(await onDelete("SalesQuotationLine", "knowledgePriceId")).toBe("SET NULL");
    expect((await column("VaneMessage", "blocks"))?.column_default).toContain("'[]'");
  });

  it("lets Vane's reader, and a rep's reading, read the knowledge base inside the workspace", async () => {
    for (const role of ["vane_reader", "vane_reader_rep"]) {
      expect(await reads(role, "CrmKnowledgePrice", "unitPrice")).toBe(true);
      expect(await reads(role, "CrmKnowledgeChunk", "text")).toBe(true);
      expect(await reads(role, "SalesQuotationLine", "knowledgePriceId")).toBe(true);
      // The search vector is the database's own working: not granted.
      expect(await reads(role, "CrmKnowledgeChunk", "search")).toBe(false);
    }
    const policies = await prisma.$queryRaw<Array<{ policyname: string }>>`SELECT policyname FROM pg_policies WHERE tablename = 'CrmKnowledgeDoc' ORDER BY policyname`;
    expect(policies.map((row) => row.policyname)).toEqual(["app_all", "vane_rep", "vane_workspace"]);
  });
});
