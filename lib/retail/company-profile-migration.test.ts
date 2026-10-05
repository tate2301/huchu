/**
 * Migration witness for `20261005130248_retail_company_profile` (SET-01).
 *
 * The shop profile carries the shop's WhatsApp number, whether it is
 * registered for VAT (yes unless the owner says not), and its default site,
 * which a closed site lets go of rather than blocking the close. The default
 * site no longer lives in the JSON setup profile.
 */

import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

type ColumnFacts = { data_type: string; is_nullable: string; column_default: string | null };

async function column(name: string): Promise<ColumnFacts | undefined> {
  const [facts] = await prisma.$queryRaw<ColumnFacts[]>`
    SELECT data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = 'RetailShopProfile' AND column_name = ${name}`;
  return facts;
}

describe("the shop profile's WhatsApp, VAT and default site, as stored", () => {
  it("keeps the WhatsApp number as optional text", async () => {
    expect(await column("whatsapp")).toEqual({ data_type: "text", is_nullable: "YES", column_default: null });
  });

  it("is registered for VAT unless told otherwise", async () => {
    expect(await column("vatRegistered")).toEqual({ data_type: "boolean", is_nullable: "NO", column_default: "true" });
  });

  it("points at a site, and lets go when the site goes", async () => {
    expect(await column("defaultSiteId")).toEqual({ data_type: "text", is_nullable: "YES", column_default: null });
    const [fk] = await prisma.$queryRaw<Array<{ foreign_table: string; delete_rule: string }>>`
      SELECT ccu.table_name AS foreign_table, rc.delete_rule
      FROM information_schema.referential_constraints rc
      JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = rc.unique_constraint_name
      WHERE rc.constraint_name = 'RetailShopProfile_defaultSiteId_fkey'`;
    expect(fk).toEqual({ foreign_table: "Site", delete_rule: "SET NULL" });
  });

  it("reads the default site from no JSON setup profile", async () => {
    const [left] = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count FROM "FiscalisationProviderConfig"
      WHERE "providerKey" = 'RETAIL_SETUP_PROFILE' AND "metadataJson" LIKE '%"defaultSiteId"%'`;
    expect(Number(left!.count)).toBe(0);
  });
});
