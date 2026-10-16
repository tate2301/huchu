/**
 * Vane's actions as they act in each module, against the test database: each
 * runs through the module's own code as the approving person and says what
 * it did in a line, and a refusal comes back as the module's sentence. CRM:
 * a deal moved (and stopped by its stage's gate), deals given an owner, a
 * note logged. Books: an accepted quote drafted as an invoice, once. Retail:
 * a reorder drafted, sent, and a late order chased.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AuthenticatedSession } from "@/lib/auth-core/types";
import { destroyProvisionedTenant } from "@/lib/platform/tenant-teardown";
import { prisma } from "@/lib/prisma";
import { addTestProduct, makeTestShop, type TestShop } from "@/lib/retail/products/test-fixtures";
import { createSupplier } from "@/lib/retail/buying/suppliers";

import { OPERATIONS } from "@/lib/operations/registry";
import { OperationRefused, type OperationActor } from "@/lib/operations/types";

let shop: TestShop;
const ids = { pipeline: "", open: "", won: "", gated: "", deal: "", dealB: "", client: "", customer: "", quote: "", supplier: "", castle: "" };

const context = (): OperationActor => ({
  companyId: shop.companyId,
  userId: shop.managerId,
  role: "MANAGER",
  session: { user: { id: shop.managerId, companyId: shop.companyId, role: "MANAGER", name: "Tafara Nyathi" } } as unknown as AuthenticatedSession,
  requestUrl: "http://vane.test/api/vane/actions/x",
  via: { kind: "integration", integration: "vane" },
});

/** Runs one kind, as a person approving it would: its inputs checked first. */
async function run(kind: string, params: Record<string, unknown>) {
  const action = OPERATIONS.find((row) => row.key === kind)!;
  const parsed = action.input.parse(params) as never;
  return action.run(context(), parsed);
}

async function refused(work: Promise<unknown>) {
  try {
    await work;
  } catch (error) {
    if (error instanceof OperationRefused) return error.message;
    throw error;
  }
  throw new Error("Expected the action to be refused");
}

beforeAll(async () => {
  process.env.NEXTAUTH_SECRET ??= "test-secret";
  shop = await makeTestShop("Vane modules");
  const companyId = shop.companyId;

  const pipeline = await prisma.crmPipeline.create({ data: { companyId, name: "Sales" } });
  const stage = (name: string, status: "OPEN" | "WON", extra: Record<string, unknown> = {}) =>
    prisma.crmPipelineStage.create({ data: { companyId, pipelineId: pipeline.id, name, status, ...extra } });
  const [open, won, gated] = [await stage("Proposal", "OPEN"), await stage("Won", "WON"), await stage("Site visited", "OPEN", { requiresSiteVisit: true })];
  const client = await prisma.crmClient.create({ data: { companyId, name: "Pomona Offices", clientNo: `CL-${randomUUID().slice(0, 6)}` } });
  const deal = (no: string) =>
    prisma.crmDeal.create({
      data: { companyId, dealNo: `${no}-${randomUUID().slice(0, 6)}`, title: no, pipelineId: pipeline.id, stageId: open.id, clientId: client.id },
    });
  const [first, second] = [await deal("Pomona fit-out"), await deal("Pomona phase 2")];

  const customer = await prisma.customer.create({ data: { companyId, name: "Chisipite Dental" } });
  const quote = await prisma.salesQuotation.create({
    data: {
      companyId,
      customerId: customer.id,
      quotationNumber: `QT-${randomUUID().slice(0, 6)}`,
      quotationDate: new Date("2026-10-01"),
      status: "ACCEPTED",
      subTotal: 300,
      total: 300,
      lines: { create: [{ description: "Chair service", quantity: 2, unitPrice: 150, lineTotal: 300 }] },
    },
  });

  const castle = await addTestProduct(companyId, { name: "Castle Lager 340ml", price: "1.20", cost: "0.86" }, { siteId: shop.mainId, onHand: 6 });
  const supplier = (await prisma.$transaction((tx) => createSupplier(tx, shop.manager(), { name: "Delta Beverages", email: "orders@delta.co.zw", leadTime: "2" }))).id;

  Object.assign(ids, {
    pipeline: pipeline.id,
    open: open.id,
    won: won.id,
    gated: gated.id,
    deal: first.id,
    dealB: second.id,
    client: client.id,
    customer: customer.id,
    quote: quote.id,
    supplier,
    castle: castle.productId,
  });
});

afterAll(async () => {
  if (!shop) return;
  await prisma.retailMessage.deleteMany({ where: { companyId: shop.companyId } });
  await prisma.retailPurchaseOrder.deleteMany({ where: { companyId: shop.companyId } });
  await prisma.vendorContact.deleteMany({ where: { companyId: shop.companyId } });
  await prisma.vendor.deleteMany({ where: { companyId: shop.companyId } });
  await prisma.salesInvoice.deleteMany({ where: { companyId: shop.companyId } });
  await prisma.salesQuotation.deleteMany({ where: { companyId: shop.companyId } });
  await prisma.customer.deleteMany({ where: { companyId: shop.companyId } });
  await prisma.crmActivity.deleteMany({ where: { companyId: shop.companyId } });
  await prisma.crmDeal.deleteMany({ where: { companyId: shop.companyId } });
  await prisma.crmClient.deleteMany({ where: { companyId: shop.companyId } });
  await prisma.crmPipelineStage.deleteMany({ where: { companyId: shop.companyId } });
  await prisma.crmPipeline.deleteMany({ where: { companyId: shop.companyId } });
  await destroyProvisionedTenant(shop.companyId);
});

describe("in the CRM", () => {
  it("moves a deal, and is stopped by a stage's gate with what is missing", async () => {
    expect(await refused(run("crm.deal.stage", { dealId: ids.deal, deal: "Pomona fit-out", stageId: ids.gated, stage: "Site visited" }))).toBe(
      "Not moved. Site visited expects a site visit to have been booked.",
    );
    expect(await run("crm.deal.stage", { dealId: ids.deal, deal: "Pomona fit-out", stageId: ids.won, stage: "Won" })).toBe("Pomona fit-out moved from Proposal to Won.");
    const deal = await prisma.crmDeal.findUniqueOrThrow({ where: { id: ids.deal } });
    expect(deal).toMatchObject({ stageId: ids.won, status: "WON" });
    expect(await prisma.crmActivity.count({ where: { dealId: ids.deal, type: "STAGE_CHANGE", createdById: shop.managerId } })).toBe(1);
  });

  it("gives deals an owner, and says when they already had them", async () => {
    const give = { records: "deals", ids: [ids.deal, ids.dealB], names: ["Pomona fit-out", "Pomona phase 2"], ownerId: shop.ownerId, owner: "Tendai Mhlanga" };
    expect(await run("crm.owner.assign", give)).toBe("2 deals given to Tendai Mhlanga.");
    expect(await run("crm.owner.assign", give)).toBe("They were already with Tendai Mhlanga.");
    expect(await refused(run("crm.owner.assign", { ...give, ownerId: randomUUID() }))).toBe("That person is not on this team.");
  });

  it("logs a note on the record, and moves when its company was last contacted", async () => {
    expect(await run("crm.note.log", { subject: "Asked for the invoice by Friday", about: "Pomona fit-out", dealId: ids.dealB })).toBe("Logged on Pomona fit-out.");
    const note = await prisma.crmActivity.findFirstOrThrow({ where: { dealId: ids.dealB, type: "NOTE" } });
    expect(note).toMatchObject({ clientId: ids.client, createdById: shop.managerId });
    expect((await prisma.crmClient.findUniqueOrThrow({ where: { id: ids.client } })).lastContactedAt).not.toBeNull();
    expect(await refused(run("crm.note.log", { subject: "x", about: "Nobody", dealId: randomUUID() }))).toBe("Deal not found.");
  });
});

describe("in Books", () => {
  it("drafts an accepted quote's invoice line for line, once", async () => {
    const params = { quotationId: ids.quote, quotationNumber: "QT-0031", customerId: ids.customer, customer: "Chisipite Dental", invoiceDate: "2026-10-14", dueDate: "2026-11-04" };
    expect(await run("books.invoice.from_quote", params)).toMatch(/^Drafted INV-.+ for Chisipite Dental, USD 300\.00\. Issue it from Books when it is right\.$/);
    const invoice = await prisma.salesInvoice.findFirstOrThrow({ where: { quotationId: ids.quote }, include: { lines: true } });
    expect(invoice).toMatchObject({ status: "DRAFT", total: 300, createdById: shop.managerId, dueDate: new Date("2026-11-04T00:00:00Z") });
    expect(invoice.lines).toMatchObject([{ description: "Chair service", quantity: 2, unitPrice: 150 }]);
    expect(await refused(run("books.invoice.from_quote", params))).toMatch(/is already invoiced on INV-/);
  });
});

describe("in Retail", () => {
  it("drafts a reorder, sends it, then chases it", async () => {
    const drafted = await run("retail.order.draft", {
      supplierId: ids.supplier,
      supplier: "Delta Beverages",
      siteId: shop.mainId,
      site: "Harare Main Branch",
      expectedDate: "2026-10-16",
      lines: [{ productId: ids.castle, name: "Castle Lager 340ml", quantity: 48, unitCost: 0.86 }],
    });
    expect(drafted).toMatch(/^.+ is a draft for Delta Beverages\. Check it and send it from the order\.$/);
    const order = await prisma.retailPurchaseOrder.findFirstOrThrow({ where: { companyId: shop.companyId, vendorId: ids.supplier }, include: { lines: true } });
    expect(order).toMatchObject({ status: "DRAFT", createdById: shop.managerId });
    expect(order.lines).toMatchObject([{ itemName: "Castle Lager 340ml" }]);

    expect(await run("retail.order.send", { orderId: order.id, poNo: order.poNo, supplier: "Delta Beverages" })).toBe(`${order.poNo} sent to Delta Beverages by email.`);
    expect(await refused(run("retail.order.send", { orderId: order.id, poNo: order.poNo, supplier: "Delta Beverages" }))).toBe(`${order.poNo} has already been sent.`);

    const chased = await run("retail.order.chase", { orderId: order.id, poNo: order.poNo, supplier: "Delta Beverages", message: `When does ${order.poNo} come?`, promisedFor: "2099-01-05" });
    expect(chased).toMatch(/^Reminder sent\. Expected date moved to/);
  });
});
