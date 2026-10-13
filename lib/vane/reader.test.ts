/**
 * Vane's reader end to end, signed in as the reader roles: a question sees one
 * workspace, people's details only when the workspace allows it, nothing but
 * one SELECT, at most 500 rows and five seconds, and leaves no binding behind.
 *
 * The real roles cannot sign in on a test database (the migration witness
 * checks that), so two test logins are made members of them; row policies and
 * column grants apply to members, so they read exactly as the roles do.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { readWorkspace, ReaderError, ROW_LIMIT } from "./reader";

const suffix = randomUUID().slice(0, 8);
const made = { a: "", b: "" };

function loginUrl(role: string): string {
  const url = new URL(process.env.DATABASE_URL!);
  url.username = role;
  url.password = role;
  return url.toString();
}

beforeAll(async () => {
  await prisma.$executeRawUnsafe(`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'test_vane_login') THEN
      CREATE ROLE test_vane_login LOGIN PASSWORD 'test_vane_login' IN ROLE vane_reader;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'test_vane_private_login') THEN
      CREATE ROLE test_vane_private_login LOGIN PASSWORD 'test_vane_private_login' IN ROLE vane_reader_private;
    END IF;
  END $$`);
  process.env.VANE_READER_DATABASE_URL = loginUrl("test_vane_login");
  process.env.VANE_READER_PRIVATE_DATABASE_URL = loginUrl("test_vane_private_login");

  for (const which of ["a", "b"] as const) {
    const company = await prisma.company.create({
      data: { name: `Vane reader ${which} ${suffix}`, slug: `vane-reader-${which}-${suffix}` },
    });
    made[which] = company.id;
    await prisma.employee.create({
      data: {
        companyId: company.id,
        employeeId: `R-${which}-${suffix}`,
        name: `Tendai ${which}`,
        phone: "+263 77 000 0000",
        nextOfKinName: "Rudo",
        nextOfKinPhone: "+263 77 000 0001",
        passportPhotoUrl: "",
        villageOfOrigin: "Mazowe",
        nationalIdNumber: `63-${suffix}-${which}`,
      },
    });
  }
  // Workspace b has turned on "People's pay and personal details"; a has not.
  await prisma.vaneSettings.create({ data: { companyId: made.b, readsPeoplePrivate: true } });
});

afterAll(async () => {
  const companies = { slug: { startsWith: "vane-reader-" } };
  await prisma.employee.deleteMany({ where: { company: companies } });
  await prisma.company.deleteMany({ where: companies });
});

describe("Vane reading a workspace", () => {
  it("sees the workspace it reads for, and no other", async () => {
    const answer = await readWorkspace(made.a, `SELECT "name" FROM "Employee" ORDER BY "name"`);
    expect(answer.rows).toEqual([{ name: "Tendai a" }]);
    expect(answer).toMatchObject({ moreThanLimit: false, readFrom: ["employee"], sql: `SELECT "name" FROM "Employee" ORDER BY "name"` });
    expect((await readWorkspace(made.a, `SELECT "id" FROM "Company"`)).rows).toEqual([{ id: made.a }]);
  });

  it("keeps two workspaces apart when they read at the same time", async () => {
    const [a, b] = await Promise.all([
      readWorkspace(made.a, `SELECT "name" FROM "Employee"`),
      readWorkspace(made.b, `SELECT "name" FROM "Employee"`),
    ]);
    expect(a.rows).toEqual([{ name: "Tendai a" }]);
    expect(b.rows).toEqual([{ name: "Tendai b" }]);
  });

  it("leaves no binding behind, after an answer or an error", async () => {
    await readWorkspace(made.a, `SELECT 1 AS one`);
    await expect(readWorkspace(made.a, `SELECT "nope" FROM "Employee"`)).rejects.toThrow(ReaderError);
    expect(await prisma.vaneReaderScope.count({ where: { companyId: { in: [made.a, made.b] } } })).toBe(0);
  });

  it("reads people's personal details only where the workspace allows it", async () => {
    const refused = readWorkspace(made.a, `SELECT "nationalIdNumber" FROM "Employee"`);
    await expect(refused).rejects.toMatchObject({ code: "failed", message: expect.stringMatching(/permission denied/) });
    const allowed = await readWorkspace(made.b, `SELECT "nationalIdNumber" FROM "Employee"`);
    expect(allowed.rows).toEqual([{ nationalIdNumber: `63-${suffix}-b` }]);
  });

  it("runs one SELECT on the workspace's tables, and nothing else", async () => {
    for (const question of [
      `DELETE FROM "Employee"`,
      `UPDATE "Company" SET "name" = 'x'`,
      `SELECT 1; SELECT 2`,
      `SELECT set_config('role', 'huchu', false)`,
      `SELECT current_setting('role')`,
      `SELECT pg_sleep(1)`,
      `SELECT * FROM pg_catalog.pg_roles`,
      `SELECT * FROM information_schema.tables`,
      `SELECT "id" FROM "Session"`,
    ]) {
      await expect(readWorkspace(made.a, question), question).rejects.toMatchObject({ code: "refused" });
    }
  });

  it("returns at most 500 rows, and says when there were more", async () => {
    const answer = await readWorkspace(made.a, `SELECT n FROM generate_series(1, 600) AS n`);
    expect(answer.rows).toHaveLength(ROW_LIMIT);
    expect(answer.moreThanLimit).toBe(true);
  });

  it("stops a question that runs too long", async () => {
    const slow = readWorkspace(made.a, `SELECT count(*) FROM generate_series(1, 500000000)`, { timeoutMs: 200 });
    await expect(slow).rejects.toMatchObject({ code: "timeout" });
  });
});
