/**
 * Migration witness for `20261006120000_retail_licence_hours_and_held_release`.
 *
 * Licence hours live per site and weekday, in minutes after midnight, one row
 * a weekday, and go with their site and company; the shop profile keeps its
 * switch, licence number and expiry and loses its four "HH:MM" columns. A
 * product's 18+ flag may be null (follow the category). A held sale says who
 * discarded it. A pairing code points at the device it paired.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

let companyId: string;
let siteId: string;

async function columns(table: string): Promise<Record<string, { type: string; nullable: boolean; default: string | null }>> {
  const rows = await prisma.$queryRaw<Array<{ name: string; type: string; nullable: string; default: string | null }>>`
    SELECT column_name AS name, udt_name AS type, is_nullable AS nullable, column_default AS default
    FROM information_schema.columns WHERE table_name = ${table}`;
  return Object.fromEntries(rows.map((row) => [row.name, { type: row.type, nullable: row.nullable === "YES", default: row.default }]));
}

async function foreignKey(name: string) {
  const [fk] = await prisma.$queryRaw<Array<{ foreign_table: string; delete_rule: string }>>`
    SELECT ccu.table_name AS foreign_table, rc.delete_rule
    FROM information_schema.referential_constraints rc
    JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = rc.unique_constraint_name
    WHERE rc.constraint_name = ${name}`;
  return fk;
}

const insertDay = (weekday: number, from: number, until: number) => prisma.$executeRaw`
  INSERT INTO "RetailLicenceHours" ("id", "companyId", "siteId", "weekday", "alcoholFrom", "alcoholUntil", "updatedAt")
  VALUES (gen_random_uuid()::text, ${companyId}, ${siteId}, ${weekday}, ${from}, ${until}, now())`;

beforeAll(async () => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  companyId = (
    await prisma.company.create({ data: { name: `Licence ${stamp}`, slug: `licence-witness-${stamp}` }, select: { id: true } })
  ).id;
  siteId = (await prisma.site.create({ data: { companyId, name: "Avondale", code: "AVD" }, select: { id: true } })).id;
});

afterAll(async () => {
  if (!companyId) return;
  await prisma.retailLicenceHours.deleteMany({ where: { companyId } });
  await prisma.site.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
});

describe("licence hours, as stored", () => {
  it("keeps a weekday and two minute counts on each row", async () => {
    const cols = await columns("RetailLicenceHours");
    expect(cols.weekday).toMatchObject({ type: "int4", nullable: false });
    expect(cols.alcoholFrom).toMatchObject({ type: "int4", nullable: false });
    expect(cols.alcoholUntil).toMatchObject({ type: "int4", nullable: false });
  });

  it("refuses a weekday past Saturday and a minute past 23:59", async () => {
    await expect(insertDay(7, 480, 1320)).rejects.toThrow(/RetailLicenceHours_weekday_range/);
    await expect(insertDay(1, 480, 1440)).rejects.toThrow(/RetailLicenceHours_minutes_range/);
    await expect(insertDay(1, -1, 1320)).rejects.toThrow(/RetailLicenceHours_minutes_range/);
  });

  it("holds one row a weekday for a site, a closed day included", async () => {
    await insertDay(5, 600, 120);
    await insertDay(0, 0, 0);
    await expect(insertDay(5, 480, 1320)).rejects.toThrow(/Unique constraint|duplicate key/);
    expect(await prisma.retailLicenceHours.count({ where: { siteId } })).toBe(2);
  });

  it("goes with its site and its company", async () => {
    expect(await foreignKey("RetailLicenceHours_siteId_fkey")).toEqual({ foreign_table: "Site", delete_rule: "CASCADE" });
    expect(await foreignKey("RetailLicenceHours_companyId_fkey")).toEqual({ foreign_table: "Company", delete_rule: "CASCADE" });
  });

  it("leaves the shop profile its switch, licence number and expiry, and none of the HH:MM columns", async () => {
    const cols = await columns("RetailShopProfile");
    expect(cols.licenceHours).toMatchObject({ type: "bool", nullable: false });
    expect(cols.licenceNumber).toMatchObject({ type: "text", nullable: true });
    expect(cols.licenceExpiresOn).toMatchObject({ type: "date", nullable: true });
    for (const gone of ["weekdayOpensAt", "weekdayClosesAt", "sundayOpensAt", "sundayClosesAt"]) expect(cols[gone]).toBeUndefined();
  });
});

describe("a product's own 18+ answer, as stored", () => {
  it("may be null, to follow the category, and has no default", async () => {
    expect((await columns("Product")).ageRestricted).toEqual({ type: "bool", nullable: true, default: null });
  });
});

describe("a discarded held sale, as stored", () => {
  it("says when, and who, and forgets who when they go", async () => {
    const cols = await columns("RetailHeldCart");
    expect(cols.releasedAt).toMatchObject({ type: "timestamp", nullable: true });
    expect(cols.releasedById).toMatchObject({ type: "text", nullable: true });
    expect(await foreignKey("RetailHeldCart_releasedById_fkey")).toEqual({ foreign_table: "User", delete_rule: "SET NULL" });
  });
});

describe("a pairing code, as stored", () => {
  it("points at the device it paired, and forgets it when the device goes", async () => {
    expect(await foreignKey("RetailPairingCode_deviceId_fkey")).toEqual({ foreign_table: "RetailDevice", delete_rule: "SET NULL" });
  });
});
