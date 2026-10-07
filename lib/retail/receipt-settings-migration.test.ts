/**
 * Migration witness for `retail_receipts_and_messages` (SET-07).
 *
 * Receipt settings are one typed row per company with the defaults the page
 * opens on (no header or footer of its own, the VAT and licence numbers
 * shown, no logo, one copy, nothing else sent). The message outbox carries
 * one set of attachment columns (C-02), a send-after time (C-03) and the
 * provider's id, goes with its company, and outlives the sale it is about.
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

async function columns(table: string): Promise<Record<string, { type: string; nullable: boolean; default: string | null }>> {
  const rows = await prisma.$queryRaw<Array<{ name: string; type: string; nullable: string; default: string | null }>>`
    SELECT column_name AS name, udt_name AS type, is_nullable AS nullable, column_default AS default
    FROM information_schema.columns WHERE table_name = ${table}`;
  return Object.fromEntries(rows.map((row) => [row.name, { type: row.type, nullable: row.nullable === "YES", default: row.default }]));
}

/** A row inserted with nothing but its company, read back as the database filled it, then rolled back. */
async function defaultsRow() {
  const company = await prisma.company.findFirst({ where: { retailReceiptSettings: null }, select: { id: true } });
  if (!company) throw new Error("The witness needs a company without receipt settings.");
  let row: Record<string, unknown> | null = null;
  await prisma
    .$transaction(async (tx) => {
      await tx.$executeRaw`INSERT INTO "RetailReceiptSettings" ("companyId", "updatedAt") VALUES (${company.id}, now())`;
      const [read] = await tx.$queryRaw<Array<Record<string, unknown>>>`
        SELECT "header", "footer", "showVatNumber", "showLicenceNumber", "printLogo", "copies",
               "alsoSendBy"::text AS "alsoSendBy", "updatedById"
        FROM "RetailReceiptSettings" WHERE "companyId" = ${company.id}`;
      row = read ?? null;
      throw new Error("rollback");
    })
    .catch((error: unknown) => {
      if (!(error instanceof Error) || error.message !== "rollback") throw error;
    });
  return row;
}

describe("receipt settings, as stored", () => {
  it("names the three ways a receipt also goes", async () => {
    expect(await enumLabels("RetailReceiptSendBy")).toEqual(["NOTHING", "WHATSAPP", "EMAIL"]);
  });

  it("fills a new row with the page's defaults", async () => {
    expect(await defaultsRow()).toEqual({
      header: null,
      footer: null,
      showVatNumber: true,
      showLicenceNumber: true,
      printLogo: false,
      copies: 1,
      alsoSendBy: "NOTHING",
      updatedById: null,
    });
  });

  it("goes with its company and forgets who changed it when they go", async () => {
    expect(await foreignKey("RetailReceiptSettings_companyId_fkey")).toEqual({ foreign_table: "Company", delete_rule: "CASCADE" });
    expect(await foreignKey("RetailReceiptSettings_updatedById_fkey")).toEqual({ foreign_table: "User", delete_rule: "SET NULL" });
  });
});

describe("the message outbox, as stored", () => {
  it("names its channels, its states and what it can carry", async () => {
    expect(await enumLabels("RetailMessageChannel")).toEqual(["WHATSAPP", "EMAIL"]);
    expect(await enumLabels("RetailMessageStatus")).toEqual(["QUEUED", "SENT", "FAILED"]);
    expect(await enumLabels("RetailMessageMediaKind")).toEqual(["IMAGE", "DOCUMENT"]);
  });

  it("has one attachment, a send-after time and the provider's id, and starts queued with no tries", async () => {
    const cols = await columns("RetailMessage");
    expect(cols.mediaUrl).toMatchObject({ type: "text", nullable: true });
    expect(cols.mediaName).toMatchObject({ type: "text", nullable: true });
    expect(cols.mediaKind).toMatchObject({ type: "RetailMessageMediaKind", nullable: true });
    expect(cols.scheduledFor).toMatchObject({ type: "timestamp", nullable: true });
    expect(cols.externalId).toMatchObject({ type: "text", nullable: true });
    expect(cols.status?.default).toContain("QUEUED");
    expect(cols.attempts?.default).toBe("0");
    // C-02: no other attachment columns.
    for (const gone of ["attachmentUrl", "documentUrl", "documentName"]) expect(cols[gone]).toBeUndefined();
  });

  it("goes with its company and keeps a message when its sale goes", async () => {
    expect(await foreignKey("RetailMessage_companyId_fkey")).toEqual({ foreign_table: "Company", delete_rule: "CASCADE" });
    expect(await foreignKey("RetailMessage_saleId_fkey")).toEqual({ foreign_table: "RetailSale", delete_rule: "SET NULL" });
  });
});
