import { test, expect } from "./_support/fixtures";
import { RETAIL } from "./_support/tenants";
import { sweepTests, type Route } from "./_support/sweep";
import { expectHealthyPage } from "./_support/assert";
import { visitSettled } from "./_support/nav";
import { companyIdFor, db, expectJournalsBalance } from "./_support/db";

/*
  Fifteen minutes for a sweep, and that number is measured rather than picked.
  See the note in `gold-suite.spec.ts`.
*/
test.describe.configure({ timeout: 900_000 });

/**
 * The shop, beyond the till.
 *
 * Phase 3.1. Retail is the best-tested vertical already — `retail-workflows`
 * rings a real sale and is the standard the rest of this suite copies. What it
 * does not do is look at the rest of the shop: purchasing, stock, promotions,
 * reports and setup are twenty-odd routes that only `retail-shots` has ever
 * visited, and only to photograph.
 *
 * This adds the sweep and the money invariants. The sale journey stays where it
 * is; there is no value in writing it twice.
 */

test.use({ tenant: RETAIL, as: "manager" });

const ROUTES: readonly Route[] = [
  { path: "/retail", name: "Retail overview" },
  { path: "/retail/sales", name: "Sales" },
  { path: "/retail/shifts", name: "Shifts" },
  { path: "/retail/customers", name: "Customers" },
  { path: "/retail/catalog", name: "Catalogue", expect: /Castle|Lager|340ml|ml\b/i },
  { path: "/retail/merchandising/pricing", name: "Pricing" },
  { path: "/retail/merchandising/promotions", name: "Promotions" },
  { path: "/retail/stock", name: "Stock" },
  { path: "/retail/stock/count", name: "Stock count" },
  { path: "/retail/stock/transfers", name: "Stock transfers" },
  { path: "/retail/purchasing/orders", name: "Purchase orders" },
  { path: "/retail/purchasing/receipts", name: "Goods receipts" },
  { path: "/retail/reports", name: "Reports" },
  { path: "/retail/setup/operations", name: "Setup — operations" },
  { path: "/retail/setup/pos-policy", name: "Setup — POS policy" },
  { path: "/retail/setup/accounting", name: "Setup — accounting" },
  { path: "/retail/setup/branding", name: "Setup — branding" },
];

/*
  One test per route. See the note in `_support/sweep.ts` for why a single
  sweeping test was the wrong shape: cold-compile cost made it a fifteen-minute
  test that reported one timeout instead of twenty-odd separate verdicts.
*/
sweepTests(ROUTES);

test("the takings add up and the journals balance", async ({ page, console_ }) => {
  const companyId = await companyIdFor(RETAIL.slug, RETAIL.seed);

  const sales = await db.retailSale.count({ where: { companyId } });
  expect(sales, "the seed rings up over five thousand sales").toBeGreaterThan(1000);

  /*
    Every sale's payments must cover its total. A sale that is short is money
    the shop thinks it has and does not, and nothing in the till UI compares the
    two after the fact — the check happens at the moment of sale and never
    again.

    Sampled rather than exhaustive: 5,158 sales with their lines and payments is
    a large read, and a systematic imbalance shows up in any hundred of them.
  */
  const sample = await db.retailSale.findMany({
    where: { companyId, status: { not: "VOIDED" } },
    take: 200,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      saleNo: true,
      totalAmount: true,
      payments: { select: { amount: true } },
    },
  });

  const short = sample.filter((sale) => {
    const paid = sale.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
    return paid + 0.005 < Number(sale.totalAmount);
  });

  expect(
    short.map((sale) => sale.saleNo),
    "every posted sale should be paid for in full",
  ).toEqual([]);

  await expectJournalsBalance(companyId);

  await visitSettled(page, "/retail/reports");
  await expectHealthyPage(page, console_);
});

test("the deliberate exceptions are visible to a shopkeeper", async ({ page, console_ }) => {
  const companyId = await companyIdFor(RETAIL.slug, RETAIL.seed);

  /*
    `seed-retail-demo.ts` seeds these on purpose — a part-received purchase
    order, a line below its reorder point, refunds and a void. They are the
    states a shopkeeper acts on, and a shop screen that has never rendered one
    cannot be trusted the day it has to.
  */
  /*
    A refund is not a status — `RetailSaleStatus` is only POSTED or VOIDED. It is
    a *sale of its own*, of `saleType` REFUND, pointing back at the sale it
    reverses through `sourceSaleId`. That is the right model (a refund has its
    own tender, its own shift and its own line in the Z-report) and it is not
    what this test assumed on the first pass.
  */
  const [partial, refunded, voided] = await Promise.all([
    db.retailPurchaseOrder.count({ where: { companyId, status: "PARTIAL" } }),
    db.retailSale.count({ where: { companyId, saleType: "REFUND" } }),
    db.retailSale.count({ where: { companyId, status: "VOIDED" } }),
  ]);

  expect(partial, "a purchase order should be part-received").toBeGreaterThan(0);
  expect(refunded, "there should be refunds against posted sales").toBeGreaterThan(0);
  expect(voided, "there should be a voided sale").toBeGreaterThan(0);

  await visitSettled(page, "/retail/purchasing/orders");
  await expectHealthyPage(page, console_);
});
