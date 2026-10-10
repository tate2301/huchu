/**
 * Migration witness for `retail_till_devices` (SET-03).
 *
 * A till carries what the owner said will run there and what is plugged in;
 * the devices paired to it, the pairing codes made for it and the messages
 * sent to it hang off it. One till has at most one active device: the partial
 * unique index refuses a second while the first is still paired. The plan
 * says how many tills may be paired.
 */

import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

type ColumnFacts = { data_type: string; is_nullable: string; column_default: string | null };

async function column(table: string, name: string): Promise<ColumnFacts | undefined> {
  const [facts] = await prisma.$queryRaw<ColumnFacts[]>`
    SELECT data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = ${table} AND column_name = ${name}`;
  return facts;
}

async function foreignKey(name: string) {
  const [fk] = await prisma.$queryRaw<Array<{ foreign_table: string; delete_rule: string }>>`
    SELECT ccu.table_name AS foreign_table, rc.delete_rule
    FROM information_schema.referential_constraints rc
    JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = rc.unique_constraint_name
    WHERE rc.constraint_name = ${name}`;
  return fk;
}

describe("tills and their devices, as stored", () => {
  it("keeps what is plugged in at a till, printer and drawer on and scale off", async () => {
    expect(await column("RetailRegister", "hasPrinter")).toEqual({ data_type: "boolean", is_nullable: "NO", column_default: "true" });
    expect(await column("RetailRegister", "hasDrawer")).toEqual({ data_type: "boolean", is_nullable: "NO", column_default: "true" });
    expect(await column("RetailRegister", "hasScale")).toEqual({ data_type: "boolean", is_nullable: "NO", column_default: "false" });
    expect(await column("RetailRegister", "deviceKind")).toMatchObject({ is_nullable: "NO", column_default: "'COUNTER_MINI'::\"RetailDeviceKind\"" });
  });

  it("sells from its own price list when it has one, and lets go when the list goes", async () => {
    expect(await column("RetailRegister", "priceListId")).toEqual({ data_type: "text", is_nullable: "YES", column_default: null });
    expect(await foreignKey("RetailRegister_priceListId_fkey")).toEqual({ foreign_table: "PriceList", delete_rule: "SET NULL" });
  });

  it("keeps a device while its till exists, and a till's codes and messages go with it", async () => {
    expect(await foreignKey("RetailDevice_registerId_fkey")).toEqual({ foreign_table: "RetailRegister", delete_rule: "RESTRICT" });
    expect(await foreignKey("RetailPairingCode_registerId_fkey")).toEqual({ foreign_table: "RetailRegister", delete_rule: "CASCADE" });
    expect(await foreignKey("RetailDeviceMessage_registerId_fkey")).toEqual({ foreign_table: "RetailRegister", delete_rule: "CASCADE" });
  });

  it("stores a pairing code only as its hash", async () => {
    expect(await column("RetailPairingCode", "codeHash")).toMatchObject({ data_type: "text", is_nullable: "NO" });
    expect(await column("RetailPairingCode", "code")).toBeUndefined();
  });

  it("says how many tills a plan may pair, any number when empty", async () => {
    expect(await column("SubscriptionPlan", "maxTills")).toEqual({ data_type: "integer", is_nullable: "YES", column_default: null });
  });

  it("has the one-active-device index on the till, for devices not unpaired", async () => {
    const [index] = await prisma.$queryRaw<Array<{ indexdef: string }>>`
      SELECT indexdef FROM pg_indexes WHERE indexname = 'RetailDevice_one_active_per_register'`;
    expect(index?.indexdef).toContain("UNIQUE INDEX");
    expect(index?.indexdef).toContain('("registerId")');
    expect(index?.indexdef).toContain('WHERE ("unpairedAt" IS NULL)');
  });

  it("refuses a second active device on one till", async () => {
    const tag = randomUUID().slice(0, 8);
    const refused = await prisma
      .$transaction(async (tx) => {
        // Everything made here is rolled back with the transaction.
        const company = await tx.company.create({ data: { name: `Witness ${tag}`, slug: `witness-${tag}` } });
        const user = await tx.user.create({
          data: { email: `witness-${tag}@example.test`, name: "Witness", role: "MANAGER", companyId: company.id, password: "x" },
        });
        const site = await tx.site.create({ data: { companyId: company.id, name: "Witness site", code: "WIT" } });
        const till = await tx.retailRegister.create({
          data: { companyId: company.id, siteId: site.id, code: "WIT-1", name: "Witness till" },
        });
        const device = (keyHash: string) => ({
          companyId: company.id,
          registerId: till.id,
          kind: "BROWSER" as const,
          keyHash,
          pairedById: user.id,
        });
        await tx.retailDevice.create({ data: device(randomUUID()) });
        // A device that was unpaired does not count.
        await tx.retailDevice.create({ data: { ...device(randomUUID()), unpairedAt: new Date() } });
        try {
          await tx.retailDevice.create({ data: device(randomUUID()) });
        } catch (error) {
          throw Object.assign(new Error("refused"), { cause: error });
        }
        throw new Error("accepted");
      })
      .catch((error: Error & { cause?: { code?: string } }) => error);

    expect(refused.message).toBe("refused");
    expect(refused.cause?.code).toBe("P2002");
  });
});
