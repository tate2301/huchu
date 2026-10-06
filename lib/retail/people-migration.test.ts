/**
 * Migration witness for `retail_people` (ADM-02, 80-admin 3.3).
 *
 * A person is a User of the tenant with a phone, an email only when they sign
 * in to the admin, sites (all, or a list) and an optional till PIN that
 * somebody issued. Their WhatsApp link is kept only as its SHA-256. "Last in"
 * reads the audit chain by actor, and the admin area's notification values
 * exist from here on.
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

async function columns(
  table: string,
): Promise<Record<string, { type: string; nullable: boolean; default: string | null }>> {
  const rows = await prisma.$queryRaw<Array<{ name: string; type: string; nullable: string; default: string | null }>>`
    SELECT column_name AS name, udt_name AS type, is_nullable AS nullable, column_default AS default
    FROM information_schema.columns WHERE table_name = ${table}`;
  return Object.fromEntries(
    rows.map((row) => [row.name, { type: row.type, nullable: row.nullable === "YES", default: row.default }]),
  );
}

async function indexDef(name: string): Promise<string | null> {
  const [row] = await prisma.$queryRaw<Array<{ def: string }>>`
    SELECT indexdef AS def FROM pg_indexes WHERE indexname = ${name}`;
  return row?.def ?? null;
}

describe("a person, as stored", () => {
  it("may have no email, and an email is still one person's", async () => {
    const cols = await columns("User");
    expect(cols.email).toMatchObject({ type: "text", nullable: true });
    expect(await indexDef("User_email_key")).toContain("CREATE UNIQUE INDEX");
  });

  it("works at every site unless told otherwise, and remembers who took their access away", async () => {
    const cols = await columns("User");
    expect(cols.allSites).toEqual({ type: "bool", nullable: false, default: "true" });
    expect(cols.accessRemovedAt).toMatchObject({ type: "timestamp", nullable: true });
    expect(cols.accessRemovedById).toMatchObject({ type: "text", nullable: true });
    expect(await foreignKey("User_accessRemovedById_fkey")).toEqual({ foreign_table: "User", delete_rule: "SET NULL" });
    expect(await indexDef("User_companyId_phone_idx")).toContain('("companyId", phone)');
  });
});

describe("the sites a person works at", () => {
  it("is one row per person and site, gone with either", async () => {
    const cols = await columns("UserSiteAccess");
    expect(Object.keys(cols).sort()).toEqual(["companyId", "createdAt", "siteId", "userId"]);
    expect(await indexDef("UserSiteAccess_pkey")).toContain('("userId", "siteId")');
    expect(await indexDef("UserSiteAccess_companyId_siteId_idx")).toContain('("companyId", "siteId")');
    expect(await foreignKey("UserSiteAccess_userId_fkey")).toEqual({ foreign_table: "User", delete_rule: "CASCADE" });
    expect(await foreignKey("UserSiteAccess_siteId_fkey")).toEqual({ foreign_table: "Site", delete_rule: "CASCADE" });
    expect(await foreignKey("UserSiteAccess_companyId_fkey")).toEqual({ foreign_table: "Company", delete_rule: "CASCADE" });
  });
});

describe("the WhatsApp link a person joins with", () => {
  it("keeps only the token's hash, once, with its phone and its seven days", async () => {
    const cols = await columns("RetailStaffInvite");
    expect(cols.tokenHash).toMatchObject({ type: "text", nullable: false });
    expect(cols.sentTo).toMatchObject({ type: "text", nullable: false });
    expect(cols.expiresAt).toMatchObject({ type: "timestamp", nullable: false });
    expect(cols.acceptedAt).toMatchObject({ type: "timestamp", nullable: true });
    expect(cols.revokedAt).toMatchObject({ type: "timestamp", nullable: true });
    expect(await indexDef("RetailStaffInvite_tokenHash_key")).toContain("CREATE UNIQUE INDEX");
    expect(await indexDef("RetailStaffInvite_companyId_userId_idx")).toContain('("companyId", "userId")');
  });

  it("goes with the person and the shop, and forgets who sent it when they go", async () => {
    expect(await foreignKey("RetailStaffInvite_companyId_fkey")).toEqual({ foreign_table: "Company", delete_rule: "CASCADE" });
    expect(await foreignKey("RetailStaffInvite_userId_fkey")).toEqual({ foreign_table: "User", delete_rule: "CASCADE" });
    expect(await foreignKey("RetailStaffInvite_invitedById_fkey")).toEqual({ foreign_table: "User", delete_rule: "SET NULL" });
  });
});

describe("a till PIN somebody issued", () => {
  it("must be changed on first use, and says when and by whom it was issued", async () => {
    const cols = await columns("RetailTillPin");
    expect(cols.mustChange).toEqual({ type: "bool", nullable: false, default: "false" });
    expect(cols.issuedAt).toMatchObject({ type: "timestamp", nullable: false });
    expect(cols.issuedById).toMatchObject({ type: "text", nullable: true });
    expect(await foreignKey("RetailTillPin_issuedById_fkey")).toEqual({ foreign_table: "User", delete_rule: "SET NULL" });
  });
});

describe("the audit chain and the area's notifications", () => {
  it("reads events by who did them", async () => {
    expect(await indexDef("PlatformAuditEvent_companyId_actor_createdAt_idx")).toContain(
      '("companyId", actor, "createdAt")',
    );
  });

  it("has the admin area's notification values", async () => {
    const types = await enumLabels("NotificationType");
    for (const value of [
      "RETAIL_PRICE_APPROVAL",
      "RETAIL_PRICE_DECIDED",
      "RETAIL_PIN_LOCKED",
      "RETAIL_SUPPORT",
      "RETAIL_STAFF_MESSAGE",
    ]) {
      expect(types).toContain(value);
    }
    const entities = await enumLabels("NotificationEntityType");
    for (const value of ["RETAIL_PRICE_APPROVAL", "RETAIL_PERSON", "RETAIL_SETTINGS"]) {
      expect(entities).toContain(value);
    }
  });
});
