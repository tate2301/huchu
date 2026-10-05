/**
 * A sale with bottle deposits, against the seeded retail posting rule.
 *
 * The deposit is paid on top of the goods and is money the shop owes back, so
 * the entry has to credit it to Bottle Deposits Held — not revenue, not VAT —
 * and still balance against the tender. And a sale with no deposit must not
 * grow a deposits line at all: a `valuePath` line with nothing at its path
 * falls back to the whole amount, which is why the sale always sends a number.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { previewPostingFromSource } from "@/lib/accounting/posting";

const SLUG = "retail-deposit-posting-test";
let companyId: string;
let userId: string;

beforeAll(async () => {
  const company = await prisma.company.upsert({
    where: { slug: SLUG },
    update: {},
    create: { name: "Retail Deposit Posting Test", slug: SLUG },
  });
  companyId = company.id;
  const user = await prisma.user.upsert({
    where: { email: `${SLUG}@shop.test` },
    update: {},
    create: { email: `${SLUG}@shop.test`, name: "Owner", role: "SUPERADMIN", companyId },
  });
  userId = user.id;
}, 120_000);

afterAll(async () => {
  await prisma.taxTemplateLine.deleteMany({ where: { template: { companyId } } });
  await prisma.postingRule.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { slug: SLUG } });
});

/**
 * Twelve Castle Lager 340ml at $1.20, VAT inside, $0.10 deposit a bottle:
 *
 *   goods  12 × 1.20 = 14.40  → net 12.52, VAT 1.88
 *   deposit 12 × 0.10 = 1.20
 *   paid   15.60 cash
 */
function sale(depositAmount: number) {
  const paid = 14.4 + depositAmount;
  return {
    companyId,
    sourceType: "RETAIL_SALE" as const,
    sourceId: null,
    sourceSubtype: "SALE",
    entryDate: new Date(),
    description: "Retail sale S-000001",
    createdById: userId,
    amount: paid,
    netAmount: 12.52,
    taxAmount: 1.88,
    grossAmount: 14.4,
    payload: { depositAmount },
    payments: [{ tenderType: "CASH", amount: paid, reference: null, currency: "USD" }],
    inventory: { lines: [], totalCost: 10.2 },
  };
}

describe("bottle deposits in the ledger", () => {
  it("credits the deposit to Bottle Deposits Held and balances", async () => {
    const posting = await previewPostingFromSource(sale(1.2));
    expect(posting.error ?? null).toBeNull();
    expect(posting.balanced).toBe(true);
    const deposits = posting.lines.filter((line) => line.accountCode === "2240");
    expect(deposits).toHaveLength(1);
    expect(deposits[0]).toMatchObject({ credit: 1.2, debit: 0, accountName: "Bottle Deposits Held" });
    const revenue = posting.lines.find((line) => line.accountCode === "4000");
    expect(revenue?.credit).toBe(12.52);
  });

  it("debits the deposit back out of Bottle Deposits Held on a refund, and balances", async () => {
    const posting = await previewPostingFromSource({
      ...sale(1.2),
      sourceType: "RETAIL_REFUND" as const,
      sourceSubtype: "REFUND",
      description: "Retail refund R-000001",
      invertDirection: true,
    });
    expect(posting.error ?? null).toBeNull();
    expect(posting.balanced).toBe(true);
    const deposits = posting.lines.filter((line) => line.accountCode === "2240");
    expect(deposits).toHaveLength(1);
    expect(deposits[0]).toMatchObject({ debit: 1.2, credit: 0 });
    const cash = posting.lines.find((line) => line.memo?.includes("CASH"));
    expect(cash).toMatchObject({ credit: 15.6, debit: 0 });
  });

  it("writes no deposits line on a sale without one", async () => {
    const posting = await previewPostingFromSource(sale(0));
    expect(posting.balanced).toBe(true);
    expect(posting.lines.some((line) => line.accountCode === "2240")).toBe(false);
  });
});
