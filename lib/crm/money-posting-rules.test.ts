/**
 * The seeded posting rules, against a real database.
 *
 * `money-posting.test.ts` proves the CRM sends the right event. This proves
 * the tenant has somewhere for it to land: thirty-six rules, one per category
 * per event, each with an active account behind it and a condition that picks
 * it out.
 *
 * Worth a database rather than a reading of the literals, because a rule that
 * names an account code the chart does not carry seeds silently and fails only
 * when somebody disburses money.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { ensureAccountingDefaults } from "@/lib/accounting/bootstrap";
import { CRM_EXPENSE_CATEGORY_ACCOUNTS } from "@/lib/accounting/defaults";
import { CRM_MONEY_REQUIRED_SOURCE_TYPES } from "@/lib/accounting/source-types";
import { REQUISITION_CATEGORIES } from "@/lib/crm/requisitions";

const SLUG = "crm-money-rules-test";
let companyId: string;

beforeAll(async () => {
  const company = await prisma.company.upsert({
    where: { slug: SLUG },
    update: {},
    create: { name: "CRM Money Rules Test", slug: SLUG },
  });
  companyId = company.id;
  await ensureAccountingDefaults(companyId);
}, 120_000);

afterAll(async () => {
  // `TaxTemplateLine.taxCodeId` has no cascade, so it pins the tenant's tax
  // codes and the delete from `Company` stops there. Swallowing that failure
  // is how this database once accumulated hundreds of seeded test tenants, so
  // the lines go first and the delete is allowed to throw if it still cannot
  // finish.
  await prisma.taxTemplateLine.deleteMany({ where: { template: { companyId } } });
  await prisma.postingRule.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { slug: SLUG } });
});

describe("every category has somewhere to post", () => {
  it("covers each requisition category with an account that exists", async () => {
    for (const category of REQUISITION_CATEGORIES) {
      const code = CRM_EXPENSE_CATEGORY_ACCOUNTS[category];
      expect(code, `${category} has no account`).toBeTruthy();

      const account = await prisma.chartOfAccount.findFirst({
        where: { companyId, code },
        select: { name: true, type: true, isActive: true, nodeType: true },
      });
      expect(account, `account ${code} for ${category} is not in the chart`).not.toBeNull();
      expect(account?.isActive).toBe(true);
      // A posting rule refuses a non-ledger account at post time, which is a
      // failure nobody sees until money moves.
      expect(account?.nodeType).toBe("LEDGER");
      expect(account?.type).toBe("EXPENSE");
    }
  });

  it("seeds a rule for each category on each event the ledger must handle", async () => {
    for (const sourceType of CRM_MONEY_REQUIRED_SOURCE_TYPES) {
      const rules = await prisma.postingRule.findMany({
        where: { companyId, sourceType, isActive: true },
        include: { conditions: true, lines: true },
      });
      expect(rules, `${sourceType} has no rules`).toHaveLength(
        REQUISITION_CATEGORIES.length,
      );

      const matched = rules.flatMap((rule) =>
        rule.conditions
          .filter((condition) => condition.field === "EXPENSE_CATEGORY")
          .map((condition) => condition.valueString),
      );
      for (const category of REQUISITION_CATEGORIES) {
        expect(matched, `${sourceType} does not match ${category}`).toContain(category);
      }
    }
  });

  it("balances every seeded rule — one debit, one credit, both at 100%", async () => {
    const rules = await prisma.postingRule.findMany({
      where: { companyId, sourceType: { in: CRM_MONEY_REQUIRED_SOURCE_TYPES } },
      include: { lines: true },
    });

    for (const rule of rules) {
      const debits = rule.lines.filter((line) => line.direction === "DEBIT");
      const credits = rule.lines.filter((line) => line.direction === "CREDIT");
      expect(debits, `${rule.name} has no debit`).toHaveLength(1);
      expect(credits, `${rule.name} has no credit`).toHaveLength(1);
      for (const line of rule.lines) {
        expect(line.allocationValue, `${rule.name} does not allocate in full`).toBe(100);
        expect(line.accountId, `${rule.name} names no account`).not.toBeNull();
      }
    }
  });

  it("sends money the right way round on each event", async () => {
    // The direction is the whole reason refund and top-up are separate source
    // types: a rule line's direction is fixed, so the sign lives in the type.
    const byType = async (sourceType: string) => {
      const rule = await prisma.postingRule.findFirst({
        where: { companyId, sourceType: sourceType as never, name: { startsWith: "Fuel" } },
        include: { lines: { include: { account: true } } },
      });
      const debit = rule!.lines.find((line) => line.direction === "DEBIT");
      const credit = rule!.lines.find((line) => line.direction === "CREDIT");
      return { debit: debit!.account!.code, credit: credit!.account!.code };
    };

    // Paying out: the expense goes up, the bank goes down.
    expect(await byType("CRM_REQUISITION_DISBURSEMENT")).toEqual({ debit: "5500", credit: "1010" });
    // Change comes back: the bank goes up, the expense comes down.
    expect(await byType("CRM_REQUISITION_REFUND")).toEqual({ debit: "1010", credit: "5500" });
    // They spent their own: the expense goes up, and they are owed it.
    expect(await byType("CRM_REQUISITION_TOPUP")).toEqual({ debit: "5500", credit: "1010" });
    // A spend with no requisition: the cost is real and somebody is owed it.
    expect(await byType("CRM_COST_ENTRY_SPEND")).toEqual({ debit: "5500", credit: "2000" });
  });

  it("leaves cash received unmapped on purpose", async () => {
    // Captured so it is visible, not posted to a guess. If somebody seeds a
    // rule for it later, this test should be the thing that makes them explain
    // which account the money came from.
    const rules = await prisma.postingRule.findMany({
      where: { companyId, sourceType: "CRM_COST_ENTRY_RECEIPT" },
    });
    expect(rules).toHaveLength(0);
  });
});
