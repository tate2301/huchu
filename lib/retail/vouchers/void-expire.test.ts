import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { destroyProvisionedTenant } from "@/lib/platform/tenant-teardown";
import { prisma } from "@/lib/prisma";
import { addTestProduct, makeTestShop, type TestShop } from "@/lib/retail/products/test-fixtures";

import { expireVouchers } from "./expire";
import { issueVoucher } from "./issue";
import { voidVouchers } from "./void";

/**
 * Voiding and lapsing (PRD-10, W-18) against the test database: a sold
 * voucher voided writes what was left to other income (Dr 2250 / Cr 4200), a
 * given one back off promotions (Cr 5450); the worker on 10 October lapses a
 * credit note whose last day was the 9th once, however often it runs; and its
 * claim reads the voucher again, so an Extend landing between the job's read
 * and its write keeps the voucher live, and a late sale's spend is not written
 * off as well.
 */

let shop: TestShop;

const issue = (input: Partial<Parameters<typeof issueVoucher>[1]>) =>
  prisma.$transaction((tx) =>
    issueVoucher(tx, { actor: shop.owner(), kind: "GIFT", funding: "SOLD", valueCents: 2000, expiresOn: "2027-10-01", sendBy: "PRINT", ...input }),
  );

async function books(sourceType: "RETAIL_VOUCHER_VOID" | "RETAIL_VOUCHER_EXPIRY", sourceId: string) {
  const entries = await prisma.journalEntry.findMany({
    where: { companyId: shop.companyId, sourceType, sourceId },
    select: { lines: { select: { debit: true, credit: true, account: { select: { code: true } } } } },
  });
  const byAccount: Record<string, number> = {};
  for (const line of entries.flatMap((entry) => entry.lines)) {
    byAccount[line.account.code] = Number(((byAccount[line.account.code] ?? 0) + Number(line.debit) - Number(line.credit)).toFixed(2));
  }
  return byAccount;
}

/** 00:10 on 10 October 2026 in Harare. */
const TEN_PAST_MIDNIGHT = new Date("2026-10-09T22:10:00Z");

beforeAll(async () => {
  shop = await makeTestShop("Voucher lapse");
  await prisma.retailPostingSettings.create({ data: { companyId: shop.companyId, schedule: "EVERY_SALE" } });
  await addTestProduct(shop.companyId, { name: "Castle Lager 340ml", price: "1.20", cost: "0.80" }, { siteId: shop.mainId, onHand: 10 });
}, 60_000);

afterEach(() => vi.restoreAllMocks());

afterAll(async () => {
  if (!shop) return;
  const { companyId } = shop;
  await prisma.journalEntry.deleteMany({ where: { companyId } });
  await prisma.retailVoucher.deleteMany({ where: { companyId } });
  await destroyProvisionedTenant(companyId);
});

describe("voiding", () => {
  it("writes a sold voucher's US$7.40 to other income and a given one's back off promotions", async () => {
    const sold = await issue({ valueCents: 740 });
    const given = await issue({ funding: "GIVEN", valueCents: 1260 });
    expect(await voidVouchers(shop.manager(), { ids: [sold.id, given.id], reason: "Printed twice" })).toBe(2);
    expect(await books("RETAIL_VOUCHER_VOID", sold.id)).toEqual({ "2250": 7.4, "4200": -7.4 });
    expect(await books("RETAIL_VOUCHER_VOID", given.id)).toEqual({ "2250": 12.6, "5450": -12.6 });
  });
});

describe("the worker", () => {
  it("lapses a refund's credit note the day after its last day, once, its US$4.20 to other income", async () => {
    const note = await issue({ kind: "CREDIT_NOTE", funding: "REFUND", valueCents: 420, expiresOn: "2026-10-09" });
    expect(await expireVouchers(new Date("2026-10-09T21:00:00Z"), shop.companyId)).toBe(0);
    expect(await expireVouchers(TEN_PAST_MIDNIGHT, shop.companyId)).toBe(1);
    expect(await expireVouchers(new Date("2026-10-09T22:20:00Z"), shop.companyId)).toBe(0);
    expect(await books("RETAIL_VOUCHER_EXPIRY", note.id)).toEqual({ "2250": 4.2, "4200": -4.2 });
    const stored = await prisma.retailVoucher.findUniqueOrThrow({ where: { id: note.id } });
    expect(stored.expiredAt?.toISOString()).toBe(TEN_PAST_MIDNIGHT.toISOString());
  });

  /** Runs `between` after the job has read what is due and before it claims each voucher. */
  function between(run: () => Promise<unknown>) {
    const findMany = prisma.retailVoucher.findMany.bind(prisma.retailVoucher);
    vi.spyOn(prisma.retailVoucher, "findMany").mockImplementationOnce((async (args: Parameters<typeof findMany>[0]) => {
      const due = await findMany(args);
      await run();
      return due;
    }) as never);
  }

  it("leaves a voucher extended after its read live", async () => {
    const extended = await issue({ valueCents: 1000, expiresOn: "2026-10-09" });
    between(() => prisma.retailVoucher.update({ where: { id: extended.id }, data: { expiresOn: new Date("2027-10-09T00:00:00Z") } }));
    expect(await expireVouchers(TEN_PAST_MIDNIGHT, shop.companyId)).toBe(0);
    const stored = await prisma.retailVoucher.findUniqueOrThrow({ where: { id: extended.id } });
    expect([stored.expiredAt, stored.balance.toFixed(2)]).toEqual([null, "10.00"]);
    expect(await books("RETAIL_VOUCHER_EXPIRY", extended.id)).toEqual({});
  });

  it("writes off what is left when it claims the voucher, not what it read before a late sale spent some", async () => {
    const spent = await issue({ valueCents: 1000, expiresOn: "2026-10-09" });
    // An offline sale from the 9th, sent in late, takes US$4.00 between the read and the claim.
    between(() => prisma.retailVoucher.update({ where: { id: spent.id }, data: { balance: { decrement: 4 } } }));
    expect(await expireVouchers(TEN_PAST_MIDNIGHT, shop.companyId)).toBe(1);
    expect(await books("RETAIL_VOUCHER_EXPIRY", spent.id)).toEqual({ "2250": 6, "4200": -6 });
    const event = await prisma.platformAuditEvent.findFirstOrThrow({ where: { entityId: spent.id, eventType: "RETAIL_VOUCHER.EXPIRED" } });
    expect(JSON.parse(event.payloadJson ?? "{}").left).toBe("6.00");
  });
});
