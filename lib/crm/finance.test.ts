/**
 * The not-receipted rule: cash the field logged against an invoice, compared
 * with what accounting has receipted on it.
 *
 * The arithmetic is pinned without a database — totals rather than payments,
 * and half a cent of rounding is not money anybody is holding. Then the query
 * is pinned against a real one, because the rule is only as good as the lines
 * it reads: income against an invoice, in this company, and nothing else.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { addCostEntry } from "@/lib/crm/daily-log";
import {
  NO_PROJECT,
  financeOverview,
  isNotReceipted,
  receiptGap,
  receiptGaps,
  shareOfGap,
  type ReceiptGap,
} from "@/lib/crm/finance";

describe("the gap on one invoice", () => {
  it("is what was logged less what was receipted", () => {
    expect(receiptGap(200, 150)?.toString()).toBe("50");
  });

  it("is nothing once accounting has receipted all of it", () => {
    expect(receiptGap(200, 200)).toBeNull();
  });

  it("is nothing when the office receipted more than the field logged", () => {
    // Part of it came by bank transfer. Nobody is holding cash.
    expect(receiptGap(200, 350)).toBeNull();
  });

  it("does not flag the rounding in a float amountPaid", () => {
    expect(receiptGap("99.99", 99.98999999999)).toBeNull();
    expect(receiptGap("0.004", 0)).toBeNull();
  });
});

describe("which lines carry the flag", () => {
  const gaps = new Map<string, ReceiptGap>([
    ["invoice-1", { invoiceDocumentId: "invoice-1" } as ReceiptGap],
  ]);

  it("flags income against an invoice with a gap", () => {
    expect(isNotReceipted({ direction: "RECEIVED", invoiceDocumentId: "invoice-1" }, gaps)).toBe(true);
  });

  it("leaves income against a settled invoice alone", () => {
    expect(isNotReceipted({ direction: "RECEIVED", invoiceDocumentId: "invoice-2" }, gaps)).toBe(false);
  });

  it("leaves income against no invoice, and every expense, alone", () => {
    expect(isNotReceipted({ direction: "RECEIVED", invoiceDocumentId: null }, gaps)).toBe(false);
    expect(isNotReceipted({ direction: "SPENT", invoiceDocumentId: "invoice-1" }, gaps)).toBe(false);
  });
});

const SLUG = "finance-test";
const OTHER_SLUG = "finance-test-other";
const NOW = new Date("2026-09-24T14:00:00.000Z");

let companyId: string;
let otherCompanyId: string;
let repId: string;
let secondRepId: string;
let invoiceId: string;
let documentId: string;

async function clear() {
  for (const id of [companyId, otherCompanyId]) {
    await prisma.crmDailyCostEntry.deleteMany({ where: { companyId: id } });
    await prisma.crmDailyLog.deleteMany({ where: { companyId: id } });
  }
  await prisma.salesInvoice.update({ where: { id: invoiceId }, data: { amountPaid: 0 } });
}

function collect(userId: string, amount: number, extra: { invoiceDocumentId?: string | null } = {}) {
  return prisma.$transaction((tx) =>
    addCostEntry(tx, {
      direction: "RECEIVED",
      category: "OTHER",
      amount,
      currency: "USD",
      description: "Deposit, cash",
      invoiceDocumentId: documentId,
      ...extra,
      companyId,
      userId,
      now: NOW,
    }),
  );
}

beforeAll(async () => {
  const company = await prisma.company.upsert({
    where: { slug: SLUG },
    update: {},
    create: { name: "Finance Test", slug: SLUG },
  });
  companyId = company.id;
  const other = await prisma.company.upsert({
    where: { slug: OTHER_SLUG },
    update: {},
    create: { name: "Finance Test Other", slug: OTHER_SLUG },
  });
  otherCompanyId = other.id;

  const rep = await prisma.user.upsert({
    where: { email: "finance-test-rep@example.invalid" },
    update: {},
    create: { email: "finance-test-rep@example.invalid", name: "Tendai", companyId, role: "SALES_REP" },
  });
  repId = rep.id;
  const second = await prisma.user.upsert({
    where: { email: "finance-test-rep2@example.invalid" },
    update: {},
    create: { email: "finance-test-rep2@example.invalid", name: "Rudo", companyId, role: "SALES_REP" },
  });
  secondRepId = second.id;

  // Whatever an interrupted run left behind, so the invoice number is free.
  await prisma.crmDailyCostEntry.deleteMany({ where: { companyId } });
  await prisma.crmLeadDocument.deleteMany({ where: { companyId } });
  await prisma.salesInvoice.deleteMany({ where: { companyId } });
  await prisma.customer.deleteMany({ where: { companyId } });

  const customer = await prisma.customer.create({ data: { companyId, name: "Mrs Moyo" } });
  const invoice = await prisma.salesInvoice.create({
    data: {
      companyId,
      customerId: customer.id,
      invoiceNumber: "FIN-TEST-0001",
      invoiceDate: NOW,
      status: "ISSUED",
      total: 500,
    },
  });
  invoiceId = invoice.id;
  const document = await prisma.crmLeadDocument.create({
    data: { companyId, type: "INVOICE", invoiceId, amount: 500 },
  });
  documentId = document.id;
});

beforeEach(clear);

afterAll(async () => {
  await clear();
  await prisma.crmLeadDocument.deleteMany({ where: { companyId } });
  await prisma.salesInvoice.deleteMany({ where: { companyId } });
  await prisma.customer.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { slug: { in: [SLUG, OTHER_SLUG] } } });
});

describe("reading the gaps from the books", () => {
  it("flags cash logged against an invoice nobody has receipted", async () => {
    await collect(repId, 200);

    const gap = (await receiptGaps(prisma, companyId)).get(documentId);
    expect(gap?.logged.toString()).toBe("200");
    expect(gap?.receipted.toString()).toBe("0");
    expect(gap?.unreceipted.toString()).toBe("200");
  });

  it("clears once accounting receipts it, however the office split it", async () => {
    // Two collections, one receipt.
    await collect(repId, 120);
    await collect(secondRepId, 80);
    await prisma.salesInvoice.update({ where: { id: invoiceId }, data: { amountPaid: 200 } });

    expect((await receiptGaps(prisma, companyId)).has(documentId)).toBe(false);
  });

  it("keeps the part the office has not caught up with", async () => {
    await collect(repId, 200);
    await prisma.salesInvoice.update({ where: { id: invoiceId }, data: { amountPaid: 150 } });

    expect((await receiptGaps(prisma, companyId)).get(documentId)?.unreceipted.toString()).toBe("50");
  });

  it("ignores cash received against no invoice", async () => {
    await collect(repId, 200, { invoiceDocumentId: null });
    expect((await receiptGaps(prisma, companyId)).size).toBe(0);
  });

  it("answers for only the invoices it is asked about", async () => {
    await collect(repId, 200);
    expect((await receiptGaps(prisma, companyId, { invoiceDocumentIds: [] })).size).toBe(0);
    expect((await receiptGaps(prisma, companyId, { invoiceDocumentIds: [documentId] })).size).toBe(1);
  });

  it("reads only this company's lines", async () => {
    await collect(repId, 200);
    expect((await receiptGaps(prisma, otherCompanyId)).size).toBe(0);
  });
});

describe("sharing a gap among the people who logged the cash", () => {
  it("splits it in proportion to what each logged", () => {
    const shares = shareOfGap(new Prisma.Decimal(50), [
      { userId: "tendai", amount: 180 },
      { userId: "rudo", amount: 120 },
    ]);
    expect(shares.get("tendai")?.toString()).toBe("30");
    expect(shares.get("rudo")?.toString()).toBe("20");
  });

  it("always adds back up to the gap, to the cent", () => {
    const shares = shareOfGap(new Prisma.Decimal(10), [
      { userId: "a", amount: 1 },
      { userId: "b", amount: 1 },
      { userId: "c", amount: 1 },
    ]);
    const total = [...shares.values()].reduce((sum, share) => sum.plus(share), new Prisma.Decimal(0));
    expect(total.toString()).toBe("10");
  });

  it("adds up one person's several collections before sharing", () => {
    const shares = shareOfGap(new Prisma.Decimal(40), [
      { userId: "tendai", amount: 50 },
      { userId: "tendai", amount: 50 },
    ]);
    expect(shares.get("tendai")?.toString()).toBe("40");
  });
});

/**
 * The overview against a small but complete book: two projects, two people,
 * requisitions in every state that matters, spend out of a float and out of
 * pocket, and a customer's invoice with money receipted on it inside and
 * outside the period.
 */
describe("the finance overview", () => {
  const OVERVIEW_SLUG = "finance-overview-test";
  const SEPTEMBER = { from: new Date("2026-09-01T00:00:00.000Z"), to: new Date("2026-09-30T00:00:00.000Z") };
  const AUGUST = { from: new Date("2026-08-01T00:00:00.000Z"), to: new Date("2026-08-31T00:00:00.000Z") };
  const LATER = new Date("2026-10-01T12:00:00.000Z");

  let company: string;
  let tendai: string;
  let rudo: string;
  let projectA: string;
  let projectB: string;

  async function wipe(id: string) {
    await prisma.crmDailyCostEntry.deleteMany({ where: { companyId: id } });
    await prisma.crmDailyLog.deleteMany({ where: { companyId: id } });
    await prisma.salesReceipt.deleteMany({ where: { companyId: id } });
    await prisma.crmLeadDocument.deleteMany({ where: { companyId: id } });
    await prisma.salesInvoice.deleteMany({ where: { companyId: id } });
    await prisma.customer.deleteMany({ where: { companyId: id } });
    await prisma.crmRequisition.deleteMany({ where: { companyId: id } });
    await prisma.crmProject.deleteMany({ where: { companyId: id } });
    await prisma.crmDeal.deleteMany({ where: { companyId: id } });
    await prisma.crmPipelineStage.deleteMany({ where: { companyId: id } });
    await prisma.crmPipeline.deleteMany({ where: { companyId: id } });
  }

  function line(
    userId: string,
    date: string,
    fields: {
      direction: "SPENT" | "RECEIVED";
      amount: number;
      projectId?: string | null;
      requisitionId?: string | null;
      invoiceDocumentId?: string | null;
      receiptUrl?: string | null;
    },
  ) {
    return prisma.$transaction((tx) =>
      addCostEntry(tx, {
        category: "MATERIALS",
        currency: "USD",
        description: "Line",
        ...fields,
        date: new Date(`${date}T00:00:00.000Z`),
        companyId: company,
        userId,
        now: LATER,
      }),
    );
  }

  function requisition(fields: {
    no: string;
    requestedById: string;
    projectId: string | null;
    status: "SUBMITTED" | "APPROVED" | "DISBURSED" | "ACQUITTED";
    amount: number;
    approvedAmount?: number;
    acquittedAmount?: number;
    submittedAt: string;
    approvedAt?: string;
    disbursedAt?: string;
  }) {
    const at = (value?: string) => (value ? new Date(`${value}T09:00:00.000Z`) : null);
    return prisma.crmRequisition.create({
      data: {
        companyId: company,
        requisitionNo: fields.no,
        status: fields.status,
        category: "MATERIALS",
        purpose: fields.no,
        projectId: fields.projectId,
        amount: fields.amount,
        approvedAmount: fields.approvedAmount ?? null,
        acquittedAmount: fields.acquittedAmount ?? null,
        currency: "USD",
        requestedById: fields.requestedById,
        submittedAt: at(fields.submittedAt),
        approvedAt: at(fields.approvedAt),
        disbursedAt: at(fields.disbursedAt),
        acquittedAt: fields.status === "ACQUITTED" ? at(fields.disbursedAt) : null,
      },
    });
  }

  beforeAll(async () => {
    company = (
      await prisma.company.upsert({
        where: { slug: OVERVIEW_SLUG },
        update: {},
        create: { name: "Finance Overview Test", slug: OVERVIEW_SLUG },
      })
    ).id;
    await wipe(company);
    tendai = (
      await prisma.user.upsert({
        where: { email: "finance-overview-tendai@example.invalid" },
        update: {},
        create: { email: "finance-overview-tendai@example.invalid", name: "Tendai", companyId: company, role: "SALES_REP" },
      })
    ).id;
    rudo = (
      await prisma.user.upsert({
        where: { email: "finance-overview-rudo@example.invalid" },
        update: {},
        create: { email: "finance-overview-rudo@example.invalid", name: "Rudo", companyId: company, role: "SALES_REP" },
      })
    ).id;

    const pipeline = await prisma.crmPipeline.create({ data: { companyId: company, name: "Sales" } });
    const stage = await prisma.crmPipelineStage.create({
      data: { companyId: company, pipelineId: pipeline.id, name: "Won", status: "WON" },
    });
    const deal = await prisma.crmDeal.create({
      data: {
        companyId: company,
        dealNo: "DEAL-FIN-1",
        title: "Warehouse floor",
        pipelineId: pipeline.id,
        stageId: stage.id,
        status: "WON",
        assignedToId: tendai,
      },
    });
    projectA = (
      await prisma.crmProject.create({
        data: { companyId: company, projectNo: "PRJ-FIN-A", name: "Warehouse floor", status: "ACTIVE", dealId: deal.id, budget: 1000 },
      })
    ).id;
    projectB = (
      await prisma.crmProject.create({
        data: { companyId: company, projectNo: "PRJ-FIN-B", name: "Showroom", status: "ACTIVE", budget: 100, managerId: rudo },
      })
    ).id;

    // The customer's invoice: 1,200, of which 100 was receipted in August and
    // 150 in September.
    const customer = await prisma.customer.create({ data: { companyId: company, name: "Mrs Moyo" } });
    const invoice = await prisma.salesInvoice.create({
      data: {
        companyId: company,
        customerId: customer.id,
        invoiceNumber: "FIN-OV-0001",
        invoiceDate: new Date("2026-08-01T00:00:00.000Z"),
        status: "ISSUED",
        total: 1200,
        amountPaid: 250,
      },
    });
    const document = await prisma.crmLeadDocument.create({
      data: { companyId: company, type: "INVOICE", invoiceId: invoice.id, dealId: deal.id, amount: 1200 },
    });
    await prisma.salesReceipt.create({
      data: { companyId: company, invoiceId: invoice.id, receiptNumber: "FIN-OV-R1", receivedAt: new Date("2026-08-10T10:00:00.000Z"), amount: 100, method: "CASH" },
    });
    await prisma.salesReceipt.create({
      data: { companyId: company, invoiceId: invoice.id, receiptNumber: "FIN-OV-R2", receivedAt: new Date("2026-09-12T10:00:00.000Z"), amount: 150, method: "CASH" },
    });

    const r1 = await requisition({
      no: "REQ-FIN-1",
      requestedById: tendai,
      projectId: projectA,
      status: "DISBURSED",
      amount: 400,
      approvedAmount: 350,
      submittedAt: "2026-09-03",
      approvedAt: "2026-09-03",
      disbursedAt: "2026-09-04",
    });
    await requisition({
      no: "REQ-FIN-2",
      requestedById: rudo,
      projectId: null,
      status: "APPROVED",
      amount: 60,
      submittedAt: "2026-09-05",
      approvedAt: "2026-09-05",
    });
    await requisition({
      no: "REQ-FIN-3",
      requestedById: rudo,
      projectId: projectB,
      status: "SUBMITTED",
      amount: 80,
      submittedAt: "2026-09-06",
    });
    // Paid out and accounted for in August: none of September's business.
    await requisition({
      no: "REQ-FIN-4",
      requestedById: tendai,
      projectId: projectA,
      status: "ACQUITTED",
      amount: 500,
      acquittedAmount: 480,
      submittedAt: "2026-08-18",
      approvedAt: "2026-08-19",
      disbursedAt: "2026-08-20",
    });

    // Spend out of the float, out of pocket, and out of the period.
    await line(tendai, "2026-09-04", { direction: "SPENT", amount: 310.5, projectId: projectA, requisitionId: r1.id, receiptUrl: "https://example.invalid/r.jpg" });
    await line(tendai, "2026-09-05", { direction: "SPENT", amount: 25, projectId: projectA });
    await line(rudo, "2026-09-06", { direction: "SPENT", amount: 120, projectId: projectB, receiptUrl: "https://example.invalid/s.jpg" });
    await line(tendai, "2026-08-15", { direction: "SPENT", amount: 5, projectId: projectA });
    // Cash both of them collected on the invoice: 300 logged against 250
    // receipted, so 50 is in somebody's hand.
    await line(tendai, "2026-09-07", { direction: "RECEIVED", amount: 180, invoiceDocumentId: document.id });
    await line(rudo, "2026-09-07", { direction: "RECEIVED", amount: 120, invoiceDocumentId: document.id });
  });

  afterAll(async () => {
    await wipe(company);
    await prisma.user.deleteMany({ where: { companyId: company } });
    await prisma.company.deleteMany({ where: { slug: OVERVIEW_SLUG } });
  });

  const overview = (scope: Partial<Parameters<typeof financeOverview>[1]> = {}) =>
    financeOverview(prisma, { companyId: company, ...SEPTEMBER, ...scope });

  it("counts float spend once: in the payout, never again as its lines", async () => {
    const { moneyOut } = await overview();
    // 350 paid out on the requisition, plus 25 and 120 spent out of pocket.
    // The 310.50 spent out of the float is inside the 350 already.
    expect(moneyOut.requisitions.toString()).toBe("350");
    expect(moneyOut.direct.toString()).toBe("145");
    expect(moneyOut.total.toString()).toBe("495");
  });

  it("takes money in from the receipts dated in the period", async () => {
    expect((await overview()).moneyIn.total.toString()).toBe("150");
    expect((await overview(AUGUST)).moneyIn.total.toString()).toBe("100");
  });

  it("reads positions as they stand now, whatever the period", async () => {
    for (const period of [SEPTEMBER, AUGUST]) {
      const result = await overview(period);
      expect(result.owedToUs.total.toString()).toBe("950");
      expect(result.floatsOut.total.toString()).toBe("350");
      expect(result.committedUnpaid.total.toString()).toBe("60");
    }
  });

  it("answers August with August's payouts", async () => {
    // The acquitted requisition paid out on the 20th, and the 5 spent on the 15th.
    expect((await overview(AUGUST)).moneyOut.total.toString()).toBe("505");
  });

  it("lists what needs somebody, with the counts behind each", async () => {
    const needs = new Map((await overview()).needsAction.map((item) => [item.kind, item]));
    expect(needs.get("awaiting-approval")?.count).toBe(1);
    expect(needs.get("awaiting-approval")?.amount?.toString()).toBe("80");
    expect(needs.get("not-receipted")?.amount?.toString()).toBe("50");
    expect(needs.get("no-receipt")?.count).toBe(1);
    expect(needs.get("over-budget")?.count).toBe(1);
  });

  it("does not count somebody's own request as waiting on them", async () => {
    // Rudo cannot approve her own; it is waiting on somebody else.
    const needs = (await overview({ viewerId: rudo })).needsAction;
    expect(needs.find((item) => item.kind === "awaiting-approval")?.count).toBe(0);
  });

  it("splits by project, over budget first, each with its requisitions", async () => {
    const { byProject } = await overview();
    expect(byProject.map((row) => row.project.id)).toEqual([projectB, projectA]);

    const [showroom, warehouse] = byProject;
    expect(showroom.overBudget).toBe(true);
    expect(showroom.spent.toString()).toBe("120");
    expect(showroom.remaining?.toString()).toBe("-20");
    expect(showroom.requisitions.map((row) => row.requisitionNo)).toEqual(["REQ-FIN-3"]);

    // A project's standing is to date: August's acquitted 500 and its 5 of
    // spend are part of what it has cost.
    expect(warehouse.committed.toString()).toBe("850");
    expect(warehouse.spent.toString()).toBe("340.5");
    expect(warehouse.remaining?.toString()).toBe("659.5");
    expect(warehouse.requisitions.map((row) => row.requisitionNo)).toEqual(["REQ-FIN-1"]);
  });

  it("splits by person, including requisitions for no project", async () => {
    const { byPerson } = await overview();
    const people = new Map(byPerson.map((row) => [row.person.id, row]));

    const them = people.get(tendai)!;
    expect(them.requested.toString()).toBe("400");
    expect(them.approved.toString()).toBe("350");
    expect(them.floatHeld.toString()).toBe("350");
    expect(them.spent.toString()).toBe("335.5");
    expect(them.unreceipted.toString()).toBe("30");

    const her = people.get(rudo)!;
    expect(her.requested.toString()).toBe("140");
    expect(her.approved.toString()).toBe("60");
    expect(her.floatHeld.toString()).toBe("0");
    expect(her.spent.toString()).toBe("120");
    expect(her.unreceipted.toString()).toBe("20");
    expect(her.requisitions.map((row) => row.requisitionNo).sort()).toEqual(["REQ-FIN-2", "REQ-FIN-3"]);

    // Whoever holds the most money comes first.
    expect(byPerson[0].person.id).toBe(tendai);
  });

  it("narrows everything to one project", async () => {
    const result = await overview({ projectId: projectA });
    expect(result.moneyOut.total.toString()).toBe("375");
    // The invoice is on the deal the project came from.
    expect(result.moneyIn.total.toString()).toBe("150");
    expect(result.committedUnpaid.total.toString()).toBe("0");
    expect(result.byProject.map((row) => row.project.id)).toEqual([projectA]);
  });

  it("narrows to money that belongs to no project", async () => {
    const result = await overview({ projectId: NO_PROJECT });
    expect(result.moneyOut.total.toString()).toBe("0");
    expect(result.committedUnpaid.total.toString()).toBe("60");
    expect(result.moneyIn.total.toString()).toBe("0");
    expect(result.byProject).toEqual([]);
  });

  it("narrows everything to one person", async () => {
    const result = await overview({ userId: rudo });
    expect(result.moneyOut.total.toString()).toBe("120");
    // Money in follows the deal's owner, and the deal is Tendai's.
    expect(result.moneyIn.total.toString()).toBe("0");
    expect(result.byPerson.map((row) => row.person.id)).toEqual([rudo]);
    expect(result.needsAction.find((item) => item.kind === "not-receipted")?.amount?.toString()).toBe("20");
    // The one project she runs, over budget.
    expect(result.needsAction.find((item) => item.kind === "over-budget")?.count).toBe(1);
  });
});
