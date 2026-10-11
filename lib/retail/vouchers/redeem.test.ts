import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { destroyProvisionedTenant } from "@/lib/platform/tenant-teardown";
import { prisma } from "@/lib/prisma";
import { makeTestShop, type TestShop } from "@/lib/retail/products/test-fixtures";

import { issueVoucher, VoucherRefusal, type Issued } from "./issue";
import { NOTHING_LEFT, OTHER_SHOP, VOIDED, redeemInSale, restoreDiscountUse, restoreVoucherUse, unusableReason } from "./redeem";
import { voidVouchers } from "./void";

/**
 * Spending a voucher and giving it back (PRD-10, W-18) against the test
 * database: the till's reasons; a discount voucher's last use taken by two
 * sales at once goes to one; money paid by voucher goes back on it when the
 * sale is reversed, never more than was paid, and never on a voucher voided
 * since; a discount voucher gets its use back.
 */

let shop: TestShop;
const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
let saleCount = 0;

const issue = (input: Partial<Parameters<typeof issueVoucher>[1]>) =>
  prisma.$transaction((tx) =>
    issueVoucher(tx, { actor: shop.owner(), kind: "GIFT", funding: "SOLD", valueCents: 2000, expiresOn: "2027-10-01", sendBy: "PRINT", ...input }),
  );

/** A sale row to hang uses on: a sale, or a reversal of one. */
async function saleRow(sourceSaleId: string | null = null) {
  saleCount += 1;
  return prisma.retailSale.create({
    data: {
      companyId: shop.companyId,
      saleNo: `${sourceSaleId ? "VOID" : "SALE"}-${saleCount}-${stamp}`,
      siteId: shop.mainId,
      saleType: sourceSaleId ? "VOID" : "SALE",
      sourceSaleId,
    },
    select: { id: true, saleNo: true },
  });
}

async function spend(voucher: Issued, amount: number) {
  const sale = await saleRow();
  await prisma.$transaction((tx) =>
    redeemInSale(tx, { actor: shop.owner(), sale: { ...sale, siteId: shop.mainId, at: new Date() }, tenders: [{ voucherId: voucher.id, amount }], discount: null }),
  );
  return sale;
}

const reversalOf = async (saleId: string) => {
  const reversal = await saleRow(saleId);
  return { actor: shop.owner(), saleId, reversalSaleId: reversal.id, reversalSaleNo: reversal.saleNo, at: new Date() };
};
const balanceOf = async (voucher: Issued) => (await prisma.retailVoucher.findUniqueOrThrow({ where: { id: voucher.id } })).balance.toFixed(2);

beforeAll(async () => {
  shop = await makeTestShop("Voucher redeem", { twoSites: true });
}, 60_000);

afterAll(async () => {
  if (!shop) return;
  const { companyId } = shop;
  await prisma.retailVoucherUse.deleteMany({ where: { companyId } });
  await prisma.journalEntry.deleteMany({ where: { companyId } });
  await prisma.retailVoucher.deleteMany({ where: { companyId } });
  await prisma.retailSale.deleteMany({ where: { companyId } });
  await destroyProvisionedTenant(companyId);
});

describe("the till's reasons", () => {
  type Row = Parameters<typeof unusableReason>[0];
  const live: Row = {
    kind: "GIFT",
    balance: { toString: () => "7.40" } as never,
    percentOff: null,
    amountOff: null,
    usesLeft: null,
    minSale: null,
    expiresOn: new Date("2026-10-09T00:00:00Z"),
    expiredAt: null,
    voidedAt: null,
    siteId: "main",
  };
  const why = (row: Partial<Row>, input: { today?: string; siteId?: string | null; basketTotal?: number | null } = {}) =>
    unusableReason({ ...live, ...row }, { today: "2026-10-09", siteId: "main", ...input });

  it("says why a voucher cannot be spent, and nothing when it can", () => {
    expect(why({})).toBeNull();
    expect(why({ voidedAt: new Date() })).toBe(VOIDED);
    expect(why({ balance: { toString: () => "0" } as never })).toBe(NOTHING_LEFT);
    expect(why({}, { today: "2026-10-10" })).toBe("It expired on 9 October 2026.");
    expect(why({}, { siteId: "borrowdale" })).toBe(OTHER_SHOP);
    expect(why({ minSale: { toString: () => "20.00" } as never }, { basketTotal: 19.99 })).toBe("It works on sales of US$20.00 or more.");
    expect(why({ kind: "DISCOUNT", usesLeft: 0 })).toBe(NOTHING_LEFT);
  });
});

describe("a discount voucher's last use", () => {
  it("goes to one of two sales taking it at once; the other is refused and nothing goes below zero", async () => {
    const discount = await issue({ kind: "DISCOUNT", funding: "GIVEN", valueCents: null, percentOff: 10, copies: 1 });
    const [first, second] = [await saleRow(), await saleRow()];
    const take = (sale: { id: string; saleNo: string }) =>
      prisma.$transaction((tx) =>
        redeemInSale(tx, {
          actor: shop.owner(),
          sale: { ...sale, siteId: shop.mainId, at: new Date() },
          tenders: [],
          discount: { voucherId: discount.id, discount: 2.79 },
        }),
      );
    const both = await Promise.allSettled([take(first), take(second)]);
    expect(both.map((result) => result.status).sort()).toEqual(["fulfilled", "rejected"]);
    const refused = both.find((result): result is PromiseRejectedResult => result.status === "rejected")!.reason;
    expect(refused).toBeInstanceOf(VoucherRefusal);
    expect(refused).toMatchObject({ status: 409, message: NOTHING_LEFT });
    const stored = await prisma.retailVoucher.findUniqueOrThrow({ where: { id: discount.id }, include: { uses: true } });
    expect([stored.usesLeft, stored.uses.length]).toEqual([0, 1]);

    // The sale that had it is voided: the use comes back, with a row against the void.
    const reversal = await reversalOf(stored.uses[0]!.saleId);
    expect(await prisma.$transaction((tx) => restoreDiscountUse(tx, { ...reversal, voucherId: discount.id }))).toBe(true);
    const back = await prisma.retailVoucher.findUniqueOrThrow({ where: { id: discount.id }, include: { uses: { orderBy: { createdAt: "asc" } } } });
    expect([back.usesLeft, back.uses.map((use) => [use.saleId, use.amount.toFixed(2), use.balanceAfter?.toFixed(0)])]).toEqual([
      1,
      [
        [stored.uses[0]!.saleId, "2.79", "0"],
        [reversal.reversalSaleId, "-2.79", "1"],
      ],
    ]);
  }, 30_000);
});

describe("putting money back on a voucher", () => {
  it("puts back what a reversal asks, never more than the sale paid with it, each time against its reversal", async () => {
    const voucher = await issue({ valueCents: 2000 });
    const sale = await spend(voucher, 15);
    expect(await balanceOf(voucher)).toBe("5.00");

    const partly = await reversalOf(sale.id);
    expect(await prisma.$transaction((tx) => restoreVoucherUse(tx, { ...partly, amount: 6 }))).toEqual([{ voucherId: voucher.id, amount: 6 }]);
    expect(await balanceOf(voucher)).toBe("11.00");

    // The rest of the sale reversed: only the US$9.00 not yet put back.
    const rest = await reversalOf(sale.id);
    expect(await prisma.$transaction((tx) => restoreVoucherUse(tx, rest))).toEqual([{ voucherId: voucher.id, amount: 9 }]);
    expect(await balanceOf(voucher)).toBe("20.00");
    const uses = await prisma.retailVoucherUse.findMany({ where: { voucherId: voucher.id }, orderBy: { createdAt: "asc" } });
    expect(uses.map((use) => [use.saleId, use.amount.toFixed(2), use.balanceAfter?.toFixed(2)])).toEqual([
      [sale.id, "15.00", "5.00"],
      [partly.reversalSaleId, "-6.00", "11.00"],
      [rest.reversalSaleId, "-9.00", "20.00"],
    ]);
    const restored = await prisma.platformAuditEvent.findMany({ where: { entityId: voucher.id, eventType: "RETAIL_VOUCHER.RESTORED" } });
    expect(restored.map((event) => JSON.parse(event.payloadJson ?? "{}").amount).sort()).toEqual(["6.00", "9.00"]);
    // Nothing more to give back.
    expect(await prisma.$transaction(async (tx) => restoreVoucherUse(tx, await reversalOf(sale.id)))).toEqual([]);
  });

  it("refuses to put money back on a voucher voided since, whose money was written off", async () => {
    const voucher = await issue({ valueCents: 1000 });
    const sale = await spend(voucher, 4);
    await voidVouchers(shop.manager(), { ids: [voucher.id], reason: "Reported stolen" });
    const reversal = await reversalOf(sale.id);
    await expect(prisma.$transaction((tx) => restoreVoucherUse(tx, reversal))).rejects.toMatchObject({
      status: 409,
      message: `${voucher.code} was voided, so what was paid with it cannot go back on it.`,
    });
    expect(await balanceOf(voucher)).toBe("6.00");
    expect(await prisma.retailVoucherUse.count({ where: { voucherId: voucher.id, amount: { lt: 0 } } })).toBe(0);
  });
});
