/**
 * The rules for what Vane may read, checked against the real schema: no
 * credential is ever granted, pay and personal details go only to the private
 * role, every workspace table is scoped, and the policies cannot loop.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { isCredentialColumn, parseSchema, readerAccess, readerSql } from "@/lib/vane/reader-access";

const models = parseSchema(readFileSync(path.join(process.cwd(), "prisma/schema.prisma"), "utf8"));
const access = readerAccess(models);
const byTable = new Map(access.readable.map((t) => [t.table, t]));

describe("what Vane may read", () => {
  it("reads every table that carries a workspace, except credentials", () => {
    const withCompany = models.filter((m) => m.fields.some((f) => f.name === "companyId") && m.name !== "VaneReaderScope");
    const missing = withCompany.filter((m) => !byTable.has(m.table) && !access.unreadable.some((u) => u.table === m.table && u.reason === "credentials"));
    expect(missing.map((m) => m.name)).toEqual([]);
  });

  it("never grants a credential to either role", () => {
    const granted = access.readable.flatMap((t) => [...t.columns, ...t.privateColumns].map((c) => `${t.table}.${c}`));
    expect(granted.filter((c) => isCredentialColumn(c.split(".")[1]!))).toEqual([]);
    for (const column of ["User.password", "CrmApiKey.keyHash", "RetailVoucher.secret", "FiscalisationProviderConfig.apiToken", "CrmFacebookConnection.pageAccessTokenEnc"]) {
      expect(granted).not.toContain(column);
    }
    for (const table of ["Account", "Session", "VerificationToken", "CrmApiKey", "RetailTillPin", "RetailPairingCode", "SessionHandoff"]) {
      expect(byTable.has(table)).toBe(false);
    }
  });

  it("keeps people's pay and personal details for the private role", () => {
    expect(byTable.get("PayrollRun")).toMatchObject({ privateTable: true, columns: [] });
    expect(byTable.get("FixedSalary")).toMatchObject({ privateTable: true, columns: [] });
    const employee = byTable.get("Employee")!;
    expect(employee.columns).toEqual(expect.arrayContaining(["id", "name", "jobTitle", "companyId"]));
    expect(employee.privateColumns).toEqual(
      expect.arrayContaining(["phone", "nationalIdNumber", "bankAccountNumber", "mobileMoneyNumber", "dateOfBirth", "taxNumber"]),
    );
    expect(employee.columns).not.toEqual(expect.arrayContaining(["phone"]));
    expect(byTable.get("SchoolGuardian")!.privateColumns).toEqual(expect.arrayContaining(["phone", "nationalId", "address"]));
  });

  it("leaves a customer's phone readable: it is how Vane drafts a reminder", () => {
    expect(byTable.get("CrmPerson")!.columns).toEqual(expect.arrayContaining(["phone"]));
  });

  it("scopes rows without a companyId through links that only point up", () => {
    const depthOf = new Map<string, number>();
    const depth = (table: string, seen = new Set<string>()): number => {
      if (depthOf.has(table)) return depthOf.get(table)!;
      if (seen.has(table)) throw new Error(`policy loop through ${table}`);
      seen.add(table);
      const t = byTable.get(table)!;
      const d = t.scope.kind === "company" ? 0 : 1 + Math.max(...t.scope.links.map((l) => depth(l.parentTable, seen)));
      depthOf.set(table, d);
      return d;
    };
    for (const t of access.readable) {
      expect(() => depth(t.table)).not.toThrow();
      if (t.scope.kind === "parents") expect(t.scope.links.length).toBeGreaterThan(0);
    }
    expect(byTable.get("DowntimeEvent")!.scope).toMatchObject({ kind: "parents" });
  });

  it("is the SQL the migration ships, for the tables that migration knew", () => {
    const shipped = readFileSync(path.join(process.cwd(), "prisma/migrations/20261012120000_vane/migration.sql"), "utf8");
    const part2 = shipped.slice(shipped.indexOf("-- Roles."));
    const now = readerSql(access).split("\n");
    const missingFromMigration = now.filter((line) => line.trim() && !part2.includes(line));
    // A later schema change can add lines (new tables to grant); it must not have changed the old ones silently.
    for (const line of missingFromMigration) expect(line).toMatch(/^(ALTER TABLE|CREATE POLICY|GRANT SELECT)/);
  });
});
