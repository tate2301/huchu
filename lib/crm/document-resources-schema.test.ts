/**
 * Migration witness for 20260925140000_crm_document_resources.
 *
 * `resources.test.ts` exercises the rules through Prisma, which would pass just
 * as happily against a schema file that disagreed with the database. This
 * reads the catalogue, and pins what the migration exists to do:
 *
 *  - The library is a table of the tenant's own, with LINK and FILE kinds, and
 *    retiring an entry is a timestamp rather than a delete — `archivedAt` is
 *    NULLABLE and there is no status to fall out of step with it.
 *  - A document offers each resource at most once: a UNIQUE index on the pair,
 *    not an intention in the bridge.
 *  - The offer goes with the document (CASCADE), so deleting a draft leaves no
 *    orphan rows pointing at a quote that is not there.
 */
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";

async function columns(table: string): Promise<Map<string, { is_nullable: string; column_default: string | null }>> {
  const rows = await prisma.$queryRaw<
    Array<{ column_name: string; is_nullable: string; column_default: string | null }>
  >`
    SELECT column_name, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${table}
  `;
  return new Map(rows.map((row) => [row.column_name, row]));
}

async function indexes(table: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ indexdef: string }>>`
    SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = ${table}
  `;
  return rows.map((row) => row.indexdef);
}

async function deleteRule(table: string, constraint: string): Promise<string | null> {
  const rows = await prisma.$queryRaw<Array<{ delete_rule: string }>>`
    SELECT rc.delete_rule
    FROM information_schema.referential_constraints rc
    JOIN information_schema.table_constraints tc
      ON tc.constraint_name = rc.constraint_name
     AND tc.constraint_schema = rc.constraint_schema
    WHERE tc.table_schema = 'public'
      AND tc.table_name = ${table}
      AND rc.constraint_name = ${constraint}
  `;
  return rows[0]?.delete_rule ?? null;
}

describe("the resource library", () => {
  it("has a LINK and a FILE kind", async () => {
    const rows = await prisma.$queryRaw<Array<{ enumlabel: string }>>`
      SELECT e.enumlabel
      FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'CrmResourceKind'
      ORDER BY e.enumsortorder
    `;
    expect(rows.map((row) => row.enumlabel)).toEqual(["LINK", "FILE"]);
  });

  it("requires a title and an address, and leaves the rest optional", async () => {
    const cols = await columns("CrmResource");
    expect(cols.get("title")?.is_nullable).toBe("NO");
    expect(cols.get("url")?.is_nullable).toBe("NO");
    expect(cols.get("description")?.is_nullable).toBe("YES");
    expect(cols.get("pathname")?.is_nullable).toBe("YES");
    expect(cols.get("contentType")?.is_nullable).toBe("YES");
  });

  it("retires an entry with a timestamp, and nothing is a default until somebody says so", async () => {
    const cols = await columns("CrmResource");
    expect(cols.get("archivedAt")?.is_nullable).toBe("YES");
    expect(cols.get("isDefault")?.column_default).toBe("false");
  });

  it("indexes the live library per tenant in its order", async () => {
    const defs = await indexes("CrmResource");
    expect(defs.some((def) => def.includes('("companyId", "archivedAt", "sortOrder")'))).toBe(true);
  });
});

describe("what a document offered", () => {
  it("offers each resource at most once per document", async () => {
    const defs = await indexes("CrmDocumentResource");
    expect(
      defs.some(
        (def) => def.startsWith("CREATE UNIQUE INDEX") && def.includes('("documentId", "resourceId")'),
      ),
    ).toBe(true);
  });

  it("goes with the document", async () => {
    expect(
      await deleteRule("CrmDocumentResource", "CrmDocumentResource_documentId_fkey"),
    ).toBe("CASCADE");
  });

  it("points at a library entry", async () => {
    expect(
      await deleteRule("CrmDocumentResource", "CrmDocumentResource_resourceId_fkey"),
    ).toBe("CASCADE");
  });
});
