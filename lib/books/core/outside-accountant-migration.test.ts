/**
 * Migration witness for `20261021100000_books_outside_accountant` (NOTES §5.1):
 * a member is staff or an outside accountant, who always has a firm and an end
 * date; no `books.void` grant is left; the readers read the new columns.
 */
import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

describe("the outside accountant, as stored", () => {
  it("makes everyone staff by default", async () => {
    const [row] = await prisma.$queryRaw<Array<{ n: bigint }>>`SELECT count(*) AS n FROM "User" WHERE "memberKind" <> 'STAFF' AND ("firmName" IS NULL OR "accessEndsOn" IS NULL)`;
    expect(Number(row!.n)).toBe(0);
  });

  it("refuses an outside accountant without a firm or an end date", async () => {
    const [constraint] = await prisma.$queryRaw<Array<{ def: string }>>`
      SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'User_outside_accountant_check'`;
    expect(constraint?.def).toContain("STAFF");
    expect(constraint?.def).toContain("firmName");
    expect(constraint?.def).toContain("accessEndsOn");
  });

  it("leaves no per-person void grant", async () => {
    expect(await prisma.userPermissionOverride.count({ where: { permissionKey: "books.void" } })).toBe(0);
  });

  it("lets Vane's and Explore's readers read the new columns", async () => {
    for (const role of ["vane_reader", "explore_reader"]) {
      const [exists] = await prisma.$queryRaw<Array<{ ok: boolean }>>`SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${role}) AS ok`;
      if (!exists?.ok) continue;
      for (const column of ["memberKind", "firmName", "accessEndsOn"]) {
        const [grant] = await prisma.$queryRaw<Array<{ ok: boolean }>>`SELECT has_column_privilege(${role}, '"User"', ${column}, 'SELECT') AS ok`;
        expect(grant?.ok, `${role} reads User.${column}`).toBe(true);
      }
    }
  });
});
