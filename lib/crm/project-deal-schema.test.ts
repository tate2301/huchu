/**
 * Migration witness for 20260926090000_crm_project_requires_deal.
 *
 * `projects.test.ts` exercises the rule through Prisma, which would pass just
 * as happily against a schema file that disagreed with the database. This
 * reads the catalogue, and pins what the migration exists to do:
 *
 *  - A project's deal is NOT NULL — a project is what a deal turns into.
 *  - Deleting a deal that has a project is refused (RESTRICT), rather than
 *    nulling a column that can no longer hold a null.
 *  - It is still one project per deal.
 */
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";

async function column(table: string, name: string) {
  const rows = await prisma.$queryRaw<Array<{ is_nullable: string }>>`
    SELECT is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${table} AND column_name = ${name}
  `;
  return rows[0] ?? null;
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

async function indexes(table: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ indexdef: string }>>`
    SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = ${table}
  `;
  return rows.map((row) => row.indexdef);
}

describe("a project's deal", () => {
  it("is required", async () => {
    expect((await column("CrmProject", "dealId"))?.is_nullable).toBe("NO");
  });

  it("cannot be deleted out from under its project", async () => {
    expect(await deleteRule("CrmProject", "CrmProject_dealId_fkey")).toBe("RESTRICT");
  });

  it("has one project at most", async () => {
    const defs = await indexes("CrmProject");
    expect(
      defs.some((def) => def.startsWith("CREATE UNIQUE INDEX") && def.includes('("companyId", "dealId")')),
    ).toBe(true);
  });
});
