/**
 * Migration witness for `retail_fiscal_settings` (SET-08).
 *
 * The fiscal settings are one typed row per company that opens closing the
 * day with the last shift and selling on while ZIMRA does not answer. The
 * device row gains ZIMRA's serial, who registered it and when, and the last
 * FDMS call that answered and the last that did not; a device that already
 * held its certificate reads as registered.
 */

import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

async function enumLabels(name: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ label: string }>>`
    SELECT e.enumlabel AS label
    FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = ${name}
    ORDER BY e.enumsortorder`;
  return rows.map((row) => row.label);
}

async function foreignKey(name: string) {
  const [fk] = await prisma.$queryRaw<Array<{ foreign_table: string; delete_rule: string }>>`
    SELECT ccu.table_name AS foreign_table, rc.delete_rule
    FROM information_schema.referential_constraints rc
    JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = rc.unique_constraint_name
    WHERE rc.constraint_name = ${name}`;
  return fk;
}

async function columns(table: string): Promise<Record<string, { type: string; nullable: boolean }>> {
  const rows = await prisma.$queryRaw<Array<{ name: string; type: string; nullable: string }>>`
    SELECT column_name AS name, udt_name AS type, is_nullable AS nullable
    FROM information_schema.columns WHERE table_name = ${table}`;
  return Object.fromEntries(rows.map((row) => [row.name, { type: row.type, nullable: row.nullable === "YES" }]));
}

/** Inside a transaction that is always rolled back. */
async function rolledBack<T>(work: (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => Promise<T>): Promise<T> {
  let result: T | undefined;
  await prisma
    .$transaction(async (tx) => {
      result = await work(tx);
      throw new Error("rollback");
    })
    .catch((error: unknown) => {
      if (!(error instanceof Error) || error.message !== "rollback") throw error;
    });
  return result as T;
}

describe("fiscal settings, as stored", () => {
  it("names how the day closes and what the tills do while ZIMRA is away", async () => {
    expect(await enumLabels("RetailFiscalDayClose")).toEqual(["WITH_LAST_SHIFT", "BY_HAND"]);
    expect(await enumLabels("RetailFiscalUnreachable")).toEqual(["KEEP_SELLING", "STOP_SELLING"]);
  });

  it("fills a new row with the page's defaults", async () => {
    const company = await prisma.company.findFirst({ where: { retailFiscalSettings: null }, select: { id: true } });
    if (!company) throw new Error("The witness needs a company without fiscal settings.");
    const row = await rolledBack(async (tx) => {
      await tx.$executeRaw`INSERT INTO "RetailFiscalSettings" ("companyId", "updatedAt") VALUES (${company.id}, now())`;
      const [read] = await tx.$queryRaw<Array<Record<string, unknown>>>`
        SELECT "dayClose"::text AS "dayClose", "whenUnreachable"::text AS "whenUnreachable", "updatedById"
        FROM "RetailFiscalSettings" WHERE "companyId" = ${company.id}`;
      return read ?? null;
    });
    expect(row).toEqual({ dayClose: "WITH_LAST_SHIFT", whenUnreachable: "KEEP_SELLING", updatedById: null });
  });

  it("goes with its company and forgets who changed it when they go", async () => {
    expect(await foreignKey("RetailFiscalSettings_companyId_fkey")).toEqual({ foreign_table: "Company", delete_rule: "CASCADE" });
    expect(await foreignKey("RetailFiscalSettings_updatedById_fkey")).toEqual({ foreign_table: "User", delete_rule: "SET NULL" });
  });
});

describe("the fiscal device, as stored", () => {
  it("keeps the serial, the registration and the last call each way", async () => {
    const cols = await columns("FiscalisationProviderConfig");
    expect(cols.serialNumber).toEqual({ type: "text", nullable: true });
    expect(cols.registeredAt).toEqual({ type: "timestamp", nullable: true });
    expect(cols.registeredById).toEqual({ type: "text", nullable: true });
    expect(cols.lastOkAt).toEqual({ type: "timestamp", nullable: true });
    expect(cols.lastFailedAt).toEqual({ type: "timestamp", nullable: true });
  });

  it("forgets who registered it when they go", async () => {
    expect(await foreignKey("FiscalisationProviderConfig_registeredById_fkey")).toEqual({
      foreign_table: "User",
      delete_rule: "SET NULL",
    });
  });

  it("reads a device that already held its certificate as registered", async () => {
    const company = await prisma.company.findFirst({ select: { id: true } });
    if (!company) throw new Error("The witness needs a company.");
    const sql = await import("node:fs").then((fs) =>
      fs.readFileSync(
        new URL("../../prisma/migrations/20261006040342_retail_fiscal_settings/migration.sql", import.meta.url),
        "utf8",
      ),
    );
    const backfill = sql.split("\n").find((line) => line.startsWith("UPDATE \"FiscalisationProviderConfig\""));
    expect(backfill).toBeDefined();
    const rows = await rolledBack(async (tx) => {
      const at = new Date("2026-03-14T09:00:00Z");
      await tx.$executeRaw`DELETE FROM "FiscalisationProviderConfig" WHERE "companyId" = ${company.id} AND "providerKey" IN ('WITNESS_A', 'WITNESS_B')`;
      await tx.$executeRaw`
        INSERT INTO "FiscalisationProviderConfig" ("id", "companyId", "providerKey", "certificateRef", "updatedAt")
        VALUES (gen_random_uuid()::text, ${company.id}, 'WITNESS_A', '{"cert":"x","key":"y"}', ${at}),
               (gen_random_uuid()::text, ${company.id}, 'WITNESS_B', NULL, ${at})`;
      await tx.$executeRawUnsafe(backfill!);
      return tx.$queryRaw<Array<{ providerKey: string; registeredAt: Date | null }>>`
        SELECT "providerKey", "registeredAt" FROM "FiscalisationProviderConfig"
        WHERE "companyId" = ${company.id} AND "providerKey" IN ('WITNESS_A', 'WITNESS_B') ORDER BY "providerKey"`;
    });
    expect(rows).toEqual([
      { providerKey: "WITNESS_A", registeredAt: new Date("2026-03-14T09:00:00Z") },
      { providerKey: "WITNESS_B", registeredAt: null },
    ]);
  });
});
