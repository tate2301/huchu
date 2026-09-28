/**
 * Migration witness for 20260928090000_self_serve_signup.
 *
 * The signup service's own tests would pass against a schema file that
 * disagreed with the database. This reads the catalogue and pins what the
 * migration exists to do:
 *
 *  - Every company has a product, and an existing one is Corelith: the column
 *    is NOT NULL with CORELITH as its default, so no row predating it is left
 *    without an answer.
 *  - A signup request can exist before its company does: `companyId` is
 *    NULLABLE, and losing the company does not lose the request.
 *  - A handoff ticket is looked up by its hash, which is unique, and dies with
 *    its user.
 *  - Codes are found by address, purpose and age, which is the index.
 */
import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

async function columns(table: string) {
  const rows = await prisma.$queryRaw<Array<{ column_name: string; is_nullable: string; column_default: string | null }>>`
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

async function foreignKeyDeleteRule(constraint: string): Promise<string | null> {
  const rows = await prisma.$queryRaw<Array<{ delete_rule: string }>>`
    SELECT delete_rule FROM information_schema.referential_constraints
    WHERE constraint_schema = 'public' AND constraint_name = ${constraint}
  `;
  return rows[0]?.delete_rule ?? null;
}

describe("self-serve signup schema", () => {
  it("gives every company a product, Corelith unless it says otherwise", async () => {
    const product = (await columns("Company")).get("product");
    expect(product?.is_nullable).toBe("NO");
    expect(product?.column_default).toContain("CORELITH");
  });

  it("lets a signup exist before its company, and outlive losing it", async () => {
    const cols = await columns("SignupRequest");
    expect(cols.get("companyId")?.is_nullable).toBe("YES");
    expect(cols.get("verifiedAt")?.is_nullable).toBe("YES");
    expect(await foreignKeyDeleteRule("SignupRequest_companyId_fkey")).toBe("SET NULL");
  });

  it("finds a handoff ticket by its unique hash, and drops it with its user", async () => {
    const defs = await indexes("SessionHandoff");
    expect(defs.some((def) => def.includes("UNIQUE") && def.includes('"tokenHash"'))).toBe(true);
    expect(await foreignKeyDeleteRule("SessionHandoff_userId_fkey")).toBe("CASCADE");
  });

  it("finds the newest code for an address and purpose by index", async () => {
    const defs = await indexes("EmailCode");
    expect(defs.some((def) => def.includes('(email, purpose, "createdAt")'))).toBe(true);
    expect((await columns("EmailCode")).has("code")).toBe(false);
  });
});
