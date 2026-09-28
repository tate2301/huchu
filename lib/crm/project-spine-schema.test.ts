/**
 * Migration witness for 20260925090000_crm_project_spine.
 *
 * `projects.test.ts` exercises the rules through Prisma, which would pass just
 * as happily against a schema file that disagreed with the database. This
 * reads the catalogue, and pins the four things the migration exists to do:
 *
 *  - The job holds the link. `CrmWorkOrder.projectId` exists and is NULLABLE —
 *    a callout is a job with no project — and deleting a project leaves its
 *    jobs standing (SET NULL) rather than erasing the work that was done.
 *  - The old link is gone. `CrmProject.workOrderId` held one job per project,
 *    which is the shape this replaces.
 *  - One project per deal is a UNIQUE index, not an intention.
 *  - The team is its own table, one row per person per project, and goes
 *    with the project.
 */
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";

async function columns(table: string): Promise<Map<string, { is_nullable: string }>> {
  const rows = await prisma.$queryRaw<Array<{ column_name: string; is_nullable: string }>>`
    SELECT column_name, is_nullable
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

describe("a job points at its project", () => {
  it("adds CrmWorkOrder.projectId, nullable", async () => {
    const cols = await columns("CrmWorkOrder");
    expect(cols.get("projectId")?.is_nullable).toBe("YES");
  });

  it("keeps the jobs when a project is deleted", async () => {
    expect(await deleteRule("CrmWorkOrder", "CrmWorkOrder_projectId_fkey")).toBe("SET NULL");
  });

  it("indexes a project's jobs by tenant", async () => {
    const defs = await indexes("CrmWorkOrder");
    expect(defs.some((def) => def.includes('("companyId", "projectId")'))).toBe(true);
  });

  it("drops the one-job link from the project", async () => {
    const cols = await columns("CrmProject");
    expect(cols.has("workOrderId")).toBe(false);
  });
});

describe("one project per deal", () => {
  it("is a unique index on (companyId, dealId)", async () => {
    const defs = await indexes("CrmProject");
    expect(
      defs.some((def) => def.startsWith("CREATE UNIQUE INDEX") && def.includes('("companyId", "dealId")')),
    ).toBe(true);
  });
});

describe("the project's team", () => {
  it("allows one row per person per project", async () => {
    const defs = await indexes("CrmProjectMember");
    expect(
      defs.some((def) => def.startsWith("CREATE UNIQUE INDEX") && def.includes('("projectId", "userId")')),
    ).toBe(true);
  });

  it("goes with the project, and with the person", async () => {
    expect(await deleteRule("CrmProjectMember", "CrmProjectMember_projectId_fkey")).toBe("CASCADE");
    expect(await deleteRule("CrmProjectMember", "CrmProjectMember_userId_fkey")).toBe("CASCADE");
  });

  it("leaves what somebody does on the project optional", async () => {
    const cols = await columns("CrmProjectMember");
    expect(cols.get("role")?.is_nullable).toBe("YES");
  });
});

describe("files can hang off a project", () => {
  it("adds PROJECT to CrmFieldEntity", async () => {
    const rows = await prisma.$queryRaw<Array<{ enumlabel: string }>>`
      SELECT e.enumlabel
      FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'CrmFieldEntity'
    `;
    expect(rows.map((row) => row.enumlabel)).toContain("PROJECT");
  });
});
