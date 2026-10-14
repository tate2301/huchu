/**
 * The witness that Vane only drafts, held on the server: Vane's draft tool
 * writes an invoice and a purchase order marked `madeByVane`, with no maker,
 * as drafts. The routes that issue, send or post them refuse such a draft
 * (409) and leave it as it was, until a signed-in person confirms it as
 * theirs (`asMine`), which makes them its maker in the same write. Only the
 * sign-in is faked; the routes, the module code and the database are real.
 */
import { randomUUID } from "node:crypto";

import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { destroyProvisionedTenant } from "@/lib/platform/tenant-teardown";
import { prisma } from "@/lib/prisma";
import { raiseOrder } from "@/lib/retail/buying/orders";
import { createSupplier } from "@/lib/retail/buying/suppliers";
import { addTestProduct, makeTestShop, type TestShop } from "@/lib/retail/products/test-fixtures";
import { callTool } from "@/lib/vane/tools";

const { validateSessionMock } = vi.hoisted(() => ({ validateSessionMock: vi.fn() }));

vi.mock("@/lib/api-utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-utils")>()),
  validateSession: validateSessionMock,
}));

import { PATCH as changeInvoice } from "./invoices/[id]/route";
import { PATCH as changeQuotation } from "./quotations/[id]/route";
import { POST as sendOrder } from "../../v2/retail/buying/orders/[id]/send/route";

let shop: TestShop;
const ids = { customer: "", quote: "", supplier: "", castle: "" };

const signedIn = () =>
  validateSessionMock.mockResolvedValue({
    session: {
      user: {
        id: shop.ownerId,
        companyId: shop.companyId,
        role: "SUPERADMIN",
        name: "Tendai Mhlanga",
        email: "owner@drafts.test",
        enabledFeatures: ["retail.core", "accounting.core"],
      },
    },
  });

async function press(handler: (request: NextRequest, context: { params: Promise<{ id: string }> }) => Promise<Response>, path: string, id: string, method: string, body: unknown) {
  const response = await handler(
    new NextRequest(`http://drafts.test${path}`, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
    { params: Promise.resolve({ id }) },
  );
  return { status: response.status, body: await response.json() };
}

/** Vane's draft, as the draft tool writes it in a job: no person behind the call. */
async function vaneDrafts(input: Record<string, unknown>) {
  const result = await callTool({ companyId: shop.companyId, jobId: null }, "draft", input);
  expect(result.ok, result.content).toBe(true);
  return JSON.parse(result.content) as { id: string; number: string; target: string };
}

beforeAll(async () => {
  process.env.NEXTAUTH_SECRET ??= "test-secret";
  shop = await makeTestShop("Vane drafts");
  const companyId = shop.companyId;
  const customer = await prisma.customer.create({ data: { companyId, name: "Borrowdale Brooke Clinic" } });
  // Their usual: 21 days, from the invoices they were sent before.
  for (const [dated, due] of [["2026-08-01", "2026-08-22"], ["2026-09-01", "2026-09-22"], ["2026-09-10", "2026-10-10"]]) {
    await prisma.salesInvoice.create({
      data: {
        companyId,
        customerId: customer.id,
        invoiceNumber: `INV-${randomUUID().slice(0, 6)}`,
        invoiceDate: new Date(dated!),
        dueDate: new Date(due!),
        status: "ISSUED",
        total: 10,
        subTotal: 10,
        createdById: shop.ownerId,
      },
    });
  }
  const quote = await prisma.salesQuotation.create({
    data: {
      companyId,
      customerId: customer.id,
      quotationNumber: `QT-${randomUUID().slice(0, 6)}`,
      quotationDate: new Date("2026-10-01"),
      status: "ACCEPTED",
      subTotal: 608,
      total: 608,
      lines: { create: [{ description: "Coved skirting", quantity: 64, unitPrice: 9.5, lineTotal: 608 }] },
    },
  });
  const castle = await addTestProduct(companyId, { name: "Castle Lager 340ml", price: "1.20", cost: "0.86" }, { siteId: shop.mainId, onHand: 6 });
  const supplier = (await prisma.$transaction((tx) => createSupplier(tx, shop.manager(), { name: "Delta Beverages", email: "orders@delta.co.zw", leadTime: "2" }))).id;
  Object.assign(ids, { customer: customer.id, quote: quote.id, supplier, castle: castle.productId });
  signedIn();
});

afterAll(async () => {
  if (!shop) return;
  await prisma.retailMessage.deleteMany({ where: { companyId: shop.companyId } });
  await prisma.retailPurchaseOrder.deleteMany({ where: { companyId: shop.companyId } });
  await prisma.vendorContact.deleteMany({ where: { companyId: shop.companyId } });
  await prisma.vendor.deleteMany({ where: { companyId: shop.companyId } });
  await prisma.journalEntry.deleteMany({ where: { companyId: shop.companyId } });
  await prisma.salesInvoice.deleteMany({ where: { companyId: shop.companyId } });
  await prisma.salesQuotation.deleteMany({ where: { companyId: shop.companyId } });
  await prisma.customer.deleteMany({ where: { companyId: shop.companyId } });
  await destroyProvisionedTenant(shop.companyId);
});

describe("Vane's draft invoice", () => {
  let invoiceId = "";

  it("is written as a draft marked as Vane's, with no maker, due on the customer's usual terms", async () => {
    const drafted = await vaneDrafts({ type: "invoice", invoice: { quotationId: ids.quote } });
    invoiceId = drafted.id;
    expect(drafted.target).toBe(`/books/invoices/${drafted.id}`);
    const invoice = await prisma.salesInvoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { lines: true } });
    expect(invoice).toMatchObject({ status: "DRAFT", madeByVane: true, createdById: null, issuedById: null, quotationId: ids.quote, total: 608 });
    expect(Math.round((invoice.dueDate!.getTime() - invoice.invoiceDate.getTime()) / 86_400_000)).toBe(21);
    expect(invoice.lines).toMatchObject([{ description: "Coved skirting", quantity: 64, unitPrice: 9.5 }]);
  });

  it("is refused by the issue route until a person confirms it as theirs, and nothing is posted", async () => {
    const refused = await press(changeInvoice, `/api/accounting/sales/invoices/${invoiceId}`, invoiceId, "PATCH", { status: "ISSUED" });
    expect(refused.status).toBe(409);
    expect(refused.body.error).toMatch(/is Vane’s draft\. Check it and confirm it as yours to issue it\./);
    expect(await prisma.salesInvoice.findUniqueOrThrow({ where: { id: invoiceId } })).toMatchObject({ status: "DRAFT", createdById: null, issuedById: null });
    expect(await prisma.journalEntry.count({ where: { companyId: shop.companyId, sourceId: invoiceId } })).toBe(0);

    // Paid straight from the drafts is the same leaving of the drafts.
    expect((await press(changeInvoice, `/api/accounting/sales/invoices/${invoiceId}`, invoiceId, "PATCH", { status: "PAID" })).status).toBe(409);
  });

  it("issued as theirs, the person is its maker in the same write, dated the day they issue it", async () => {
    const issued = await press(changeInvoice, `/api/accounting/sales/invoices/${invoiceId}`, invoiceId, "PATCH", { status: "ISSUED", asMine: true });
    expect(issued.status).toBe(200);
    const invoice = await prisma.salesInvoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(invoice).toMatchObject({ status: "ISSUED", madeByVane: true, createdById: shop.ownerId, issuedById: shop.ownerId });
    expect(invoice.invoiceDate.toISOString().slice(0, 10)).toBe(new Date().toISOString().slice(0, 10));
    expect(Math.round((invoice.dueDate!.getTime() - invoice.invoiceDate.getTime()) / 86_400_000)).toBe(21);
  });
});

describe("Vane's draft quotation", () => {
  it("is refused by the send route until a person confirms it as theirs", async () => {
    const quote = await prisma.salesQuotation.create({
      data: {
        companyId: shop.companyId,
        customerId: ids.customer,
        quotationNumber: `QT-${randomUUID().slice(0, 6)}`,
        quotationDate: new Date("2026-10-09"),
        madeByVane: true,
        subTotal: 100,
        total: 100,
      },
    });
    const path = `/api/accounting/sales/quotations/${quote.id}`;
    const refused = await press(changeQuotation, path, quote.id, "PATCH", { status: "SENT" });
    expect(refused.status).toBe(409);
    expect(await prisma.salesQuotation.findUniqueOrThrow({ where: { id: quote.id } })).toMatchObject({ status: "DRAFT", createdById: null });

    expect((await press(changeQuotation, path, quote.id, "PATCH", { status: "SENT", asMine: true })).status).toBe(200);
    expect(await prisma.salesQuotation.findUniqueOrThrow({ where: { id: quote.id } })).toMatchObject({ status: "SENT", createdById: shop.ownerId, issuedById: shop.ownerId });
  });
});

describe("Vane's draft purchase order", () => {
  it("is written as a draft marked as Vane's, refused by the send route, and sent once a person confirms it as theirs", async () => {
    const drafted = await vaneDrafts({
      type: "retail_order",
      retail_order: { supplierId: ids.supplier, siteId: shop.mainId, lines: [{ productId: ids.castle, quantity: 48, unitCost: 0.86 }] },
    });
    expect(drafted.target).toBe(`/retail/buying/orders/${drafted.id}`);
    expect(await prisma.retailPurchaseOrder.findUniqueOrThrow({ where: { id: drafted.id } })).toMatchObject({ status: "DRAFT", madeByVane: true, createdById: null });

    const path = `/api/v2/retail/buying/orders/${drafted.id}/send`;
    const refused = await press(sendOrder, path, drafted.id, "POST", {});
    expect(refused.status).toBe(409);
    expect(await prisma.retailPurchaseOrder.findUniqueOrThrow({ where: { id: drafted.id } })).toMatchObject({ status: "DRAFT", createdById: null, sentAt: null });
    expect(await prisma.retailMessage.count({ where: { companyId: shop.companyId } })).toBe(0);

    expect((await press(sendOrder, path, drafted.id, "POST", { asMine: true })).status).toBe(200);
    expect(await prisma.retailPurchaseOrder.findUniqueOrThrow({ where: { id: drafted.id } })).toMatchObject({ status: "SENT", createdById: shop.ownerId, sentById: shop.ownerId });
  });

  it("can never be raised as sent, or with the cash asked for, as Vane's", async () => {
    const order = { supplierId: ids.supplier, siteId: shop.mainId, payment: "ON_ACCOUNT" as const, lines: [{ productId: ids.castle, quantity: 1, unitCost: 0.86 }] };
    const deps = { requestUrl: "http://drafts.test/" };
    await expect(raiseOrder(shop.owner(), { ...order, send: true, madeByVane: true }, deps)).rejects.toMatchObject({ status: 409 });
    await expect(raiseOrder(shop.owner(), { ...order, send: false, askForCash: true, madeByVane: true }, deps)).rejects.toMatchObject({ status: 409 });
  });
});
