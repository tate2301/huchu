/**
 * Migration witness for `20261012120000_vane`.
 *
 * Vane's tables, the "made by Vane" mark on drafts, and the two roles Vane
 * reads through. The reader checks run as the roles themselves: a connection
 * bound to one workspace sees that workspace's rows and nothing else, cannot
 * read people's pay or personal details unless it is the private role, never
 * reads a credential, and cannot write.
 */

import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

type Reader = "vane_reader" | "vane_reader_private";

class Rollback extends Error {
  constructor(readonly rows: unknown[]) {
    super("rollback");
  }
}

/**
 * Runs one statement as a reader bound to `companyId` (or to nothing), then
 * rolls everything back, binding included. Rejects with the database's error
 * when the reader may not run it.
 */
async function asReader<T = Record<string, unknown>>(role: Reader, companyId: string | null, sql: string): Promise<T[]> {
  try {
    await prisma.$transaction(async (tx) => {
      if (companyId) {
        await tx.$executeRaw`INSERT INTO "VaneReaderScope" ("pid", "companyId") VALUES (pg_backend_pid(), ${companyId})
          ON CONFLICT ("pid") DO UPDATE SET "companyId" = EXCLUDED."companyId"`;
      }
      await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);
      const rows = await tx.$queryRawUnsafe<unknown[]>(sql);
      throw new Rollback(rows);
    });
  } catch (error) {
    if (error instanceof Rollback) return error.rows as T[];
    throw error;
  }
  throw new Error("unreachable");
}

const suffix = randomUUID().slice(0, 8);
const made = { a: "", b: "" };

beforeAll(async () => {
  const [a, b] = await Promise.all(
    ["a", "b"].map((which) =>
      prisma.company.create({ data: { name: `Vane witness ${which} ${suffix}`, slug: `vane-witness-${which}-${suffix}` } }),
    ),
  );
  made.a = a!.id;
  made.b = b!.id;
  for (const company of [a!, b!]) {
    await prisma.vanePlan.create({
      data: {
        companyId: company.id,
        title: `VAT for September ${company.slug}`,
        steps: { create: [{ position: 1, label: "Match CBZ lines", owner: "VANE" }] },
      },
    });
    await prisma.employee.create({
      data: {
        companyId: company.id,
        employeeId: `E-${suffix}`,
        name: `Kuda ${company.slug}`,
        phone: "+263 77 000 0000",
        nextOfKinName: "Rudo",
        nextOfKinPhone: "+263 77 000 0001",
        passportPhotoUrl: "",
        villageOfOrigin: "Mazowe",
        nationalIdNumber: `63-${suffix}-${company.id === made.a ? "a" : "b"}`,
      },
    });
    await prisma.user.create({
      data: { companyId: company.id, name: `Farai ${company.slug}`, email: `farai-${company.slug}@vane.test`, password: "x", role: "MANAGER" },
    });
  }
});

afterAll(async () => {
  // Users do not go with their company; earlier interrupted runs are swept up too.
  const companies = { slug: { startsWith: "vane-witness-" } };
  await prisma.user.deleteMany({ where: { company: companies } });
  await prisma.employee.deleteMany({ where: { company: companies } });
  await prisma.company.deleteMany({ where: companies });
});

describe("Vane's tables, as stored", () => {
  it("has every table the spec lists, with the binding table beside them", async () => {
    const rows = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'Vane%' ORDER BY 1`;
    // VaneAction and VaneMessage came with 20261014090000_vane_chat_actions, VaneCardChoice
    // with 20261014190000_vane_card_choices.
    expect(rows.map((r) => r.table_name)).toEqual([
      "VaneAction",
      "VaneCardChoice",
      "VaneItem",
      "VaneJob",
      "VaneMessage",
      "VanePlan",
      "VanePlanStep",
      "VaneReaderScope",
      "VaneSettings",
      "VaneTopicStop",
    ]);
  });

  it("keeps the SQL and what it read on every card", async () => {
    const rows = await prisma.$queryRaw<Array<{ column_name: string; data_type: string; is_nullable: string }>>`
      SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'VaneItem'`;
    const facts = Object.fromEntries(rows.map((r) => [r.column_name, r]));
    expect(facts.sql).toMatchObject({ data_type: "text", is_nullable: "YES" });
    expect(facts.readFrom).toMatchObject({ data_type: "jsonb", is_nullable: "NO" });
    expect(facts.action).toMatchObject({ data_type: "jsonb", is_nullable: "NO" });
  });

  it("runs a job with the same key once per workspace", async () => {
    const indexes = await prisma.$queryRaw<Array<{ indexdef: string }>>`
      SELECT indexdef FROM pg_indexes WHERE indexname = 'VaneJob_companyId_key_key'`;
    expect(indexes[0]?.indexdef).toContain('UNIQUE INDEX "VaneJob_companyId_key_key" ON public."VaneJob" USING btree ("companyId", key)');
  });

  it("marks drafts Vane wrote, and nothing else, on invoices, quotations and purchase orders", async () => {
    const rows = await prisma.$queryRaw<Array<{ table_name: string; column_default: string; is_nullable: string }>>`
      SELECT table_name, column_default, is_nullable FROM information_schema.columns WHERE column_name = 'madeByVane' ORDER BY 1`;
    expect(rows).toEqual(
      ["RetailPurchaseOrder", "SalesInvoice", "SalesQuotation"].map((table_name) => ({ table_name, column_default: "false", is_nullable: "NO" })),
    );
  });

  it("keeps pay and personal details off until Management turns them on", async () => {
    const settings = await prisma.vaneSettings.create({ data: { companyId: made.a } });
    expect(settings).toMatchObject({ readsPeoplePrivate: false, paused: false, monthlyAllowance: 5000, quietFrom: "20:00", quietTo: "06:00" });
  });
});

describe("the reader roles", () => {
  it("exist, cannot sign in yet, and the private one has everything the plain one has", async () => {
    const roles = await prisma.$queryRaw<Array<{ rolname: string; rolcanlogin: boolean; rolsuper: boolean; rolbypassrls: boolean }>>`
      SELECT rolname, rolcanlogin, rolsuper, rolbypassrls FROM pg_roles WHERE rolname LIKE 'vane_reader%' ORDER BY 1`;
    expect(roles).toEqual([
      { rolname: "vane_reader", rolcanlogin: false, rolsuper: false, rolbypassrls: false },
      { rolname: "vane_reader_private", rolcanlogin: false, rolsuper: false, rolbypassrls: false },
    ]);
    const [member] = await prisma.$queryRaw<Array<{ ok: boolean }>>`SELECT pg_has_role('vane_reader_private', 'vane_reader', 'USAGE') AS ok`;
    expect(member!.ok).toBe(true);
  });

  it("see only the workspace they are bound to", async () => {
    const plans = await asReader<{ companyId: string }>("vane_reader", made.a, `SELECT "companyId" FROM "VanePlan" WHERE "title" LIKE '%${suffix}'`);
    expect(plans).toEqual([{ companyId: made.a }]);
    const steps = await asReader<{ label: string }>(
      "vane_reader",
      made.b,
      `SELECT s."label" FROM "VanePlanStep" s JOIN "VanePlan" p ON p."id" = s."planId" WHERE p."title" LIKE '%${suffix}'`,
    );
    expect(steps).toEqual([{ label: "Match CBZ lines" }]);
  });

  it("see nothing when they are bound to no workspace", async () => {
    expect(await asReader("vane_reader", null, `SELECT "id" FROM "VanePlan"`)).toEqual([]);
    expect(await asReader("vane_reader", null, `SELECT "id" FROM "Company"`)).toEqual([]);
  });

  it("cannot rebind themselves to another workspace", async () => {
    await expect(
      asReader("vane_reader", made.a, `UPDATE "VaneReaderScope" SET "companyId" = '${made.b}' WHERE "pid" = pg_backend_pid() RETURNING "pid"`),
    ).rejects.toThrow(/permission denied/);
    const others = await asReader("vane_reader", made.a, `SELECT "pid" FROM "VaneReaderScope" WHERE "pid" <> pg_backend_pid()`);
    expect(others).toEqual([]);
  });

  it("read names but not people's personal details, unless private", async () => {
    const people = await asReader<{ name: string }>("vane_reader", made.a, `SELECT "name" FROM "Employee" WHERE "employeeId" = 'E-${suffix}'`);
    expect(people).toEqual([{ name: expect.stringContaining("vane-witness-a") }]);
    await expect(asReader("vane_reader", made.a, `SELECT "nationalIdNumber" FROM "Employee"`)).rejects.toThrow(/permission denied/);
    await expect(asReader("vane_reader", made.a, `SELECT "bankAccountNumber" FROM "Employee"`)).rejects.toThrow(/permission denied/);
    await expect(asReader("vane_reader", made.a, `SELECT "phone" FROM "User"`)).rejects.toThrow(/permission denied/);
    const ids = await asReader<{ nationalIdNumber: string }>(
      "vane_reader_private",
      made.a,
      `SELECT "nationalIdNumber" FROM "Employee" WHERE "employeeId" = 'E-${suffix}'`,
    );
    expect(ids).toEqual([{ nationalIdNumber: `63-${suffix}-a` }]);
  });

  it("read pay only as the private role", async () => {
    await expect(asReader("vane_reader", made.a, `SELECT "id" FROM "PayrollRun"`)).rejects.toThrow(/permission denied/);
    await expect(asReader("vane_reader_private", made.a, `SELECT "id" FROM "PayrollRun"`)).resolves.toEqual([]);
  });

  it("never read a credential, private or not", async () => {
    for (const role of ["vane_reader", "vane_reader_private"] as const) {
      await expect(asReader(role, made.a, `SELECT "password" FROM "User"`)).rejects.toThrow(/permission denied/);
      await expect(asReader(role, made.a, `SELECT "id" FROM "Session"`)).rejects.toThrow(/permission denied/);
      await expect(asReader(role, made.a, `SELECT "keyHash" FROM "CrmApiKey"`)).rejects.toThrow(/permission denied/);
      await expect(asReader(role, made.a, `SELECT "secret" FROM "RetailVoucher"`)).rejects.toThrow(/permission denied/);
    }
  });

  it("cannot write, even to Vane's own tables", async () => {
    await expect(
      asReader("vane_reader_private", made.a, `INSERT INTO "VanePlan" ("id", "companyId", "title") VALUES ('x', '${made.a}', 'x')`),
    ).rejects.toThrow(/permission denied/);
    await expect(asReader("vane_reader", made.a, `UPDATE "Company" SET "name" = 'x'`)).rejects.toThrow(/permission denied/);
    await expect(asReader("vane_reader", made.a, `DELETE FROM "VaneItem"`)).rejects.toThrow(/permission denied/);
  });

  it("leave the app's own reads and writes as they were", async () => {
    const plans = await prisma.vanePlan.findMany({ where: { companyId: { in: [made.a, made.b] } } });
    expect(plans).toHaveLength(2);
    const updated = await prisma.vanePlan.updateMany({ where: { companyId: made.a }, data: { status: "DONE" } });
    expect(updated.count).toBe(1);
  });
});

describe("every readable table", () => {
  it("has its workspace policy for the readers", async () => {
    const rows = await prisma.$queryRaw<Array<{ tablename: string }>>`
      SELECT c.relname AS tablename FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
        AND EXISTS (SELECT 1 FROM information_schema.column_privileges p
                    WHERE p.table_name = c.relname AND p.grantee IN ('vane_reader', 'vane_reader_private'))
        AND NOT EXISTS (SELECT 1 FROM pg_policies pol
                        WHERE pol.tablename = c.relname AND pol.permissive = 'RESTRICTIVE' AND 'vane_reader' = ANY (pol.roles))`;
    expect(rows.map((r) => r.tablename)).toEqual([]);
  });

  it("stays open to the app: wherever row security is on, an app_all policy lets everyone else through", async () => {
    // The table owner skips policies anyway; this covers an app that connects as another role.
    const rows = await prisma.$queryRaw<Array<{ relname: string }>>`
      SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
        AND NOT EXISTS (SELECT 1 FROM pg_policies pol
                        WHERE pol.tablename = c.relname AND pol.policyname = 'app_all' AND pol.permissive = 'PERMISSIVE'
                          AND pol.roles = '{public}' AND pol.cmd = 'ALL' AND pol.qual = 'true' AND pol.with_check = 'true')`;
    expect(rows.map((r) => r.relname)).toEqual([]);
    const [forced] = await prisma.$queryRaw<Array<{ n: bigint }>>`
      SELECT count(*) AS n FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relforcerowsecurity`;
    expect(Number(forced!.n)).toBe(0);
  });

  it("is read through policies that do not trip over each other", async () => {
    // Every policy-bearing table, selected once as the reader: a policy loop
    // would raise "infinite recursion detected in policy".
    const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
      SELECT DISTINCT tablename FROM pg_policies WHERE policyname = 'vane_workspace' ORDER BY 1`;
    expect(tables.length).toBeGreaterThan(300);
    const failures: string[] = [];
    for (const { tablename } of tables) {
      const [column] = await prisma.$queryRaw<Array<{ column_name: string }>>`
        SELECT column_name FROM information_schema.column_privileges
        WHERE table_name = ${tablename} AND grantee IN ('vane_reader', 'vane_reader_private') AND privilege_type = 'SELECT' LIMIT 1`;
      if (!column) continue;
      await asReader("vane_reader_private", made.a, `SELECT "${column.column_name}" FROM "${tablename}" LIMIT 1`).catch(
        (error: Error) => failures.push(`${tablename}: ${error.message}`),
      );
    }
    expect(failures).toEqual([]);
  }, 120_000);
});
