/**
 * Vane's own drafts, against the test database, through the `draft` tool:
 * an accepted quote becomes a draft invoice made by Vane with no person as
 * its maker, which a person issues (posting it) or Vane's discard deletes; a
 * reorder becomes a draft order made by Vane, which nobody has sent; and with
 * drafts switched off, nothing is drafted.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AuthenticatedSession } from "@/lib/auth-core/types";
import { prisma } from "@/lib/prisma";
import { destroyProvisionedTenant } from "@/lib/platform/tenant-teardown";
import { createSupplier } from "@/lib/retail/buying/suppliers";
import { addTestProduct, makeTestShop, type TestShop } from "@/lib/retail/products/test-fixtures";

import { readInvoiceRecord } from "@/lib/books/invoice-record";

import { VANE_ACTIONS } from "./actions/registry";
import type { VaneActionContext } from "./actions/types";
import { callTool } from "./tools";

let shop: TestShop;
const ids = { quote: "", supplier: "", castle: "" };

const context = (): VaneActionContext => ({
  companyId: shop.companyId,
  userId: shop.managerId,
  role: "MANAGER",
  session: { user: { id: shop.managerId, companyId: shop.companyId, role: "MANAGER", name: "Tafara" } } as unknown as AuthenticatedSession,
  requestUrl: "http://vane.test/api/vane/actions/x",
});
const action = (kind: string) => VANE_ACTIONS.find((row) => row.kind === kind)!;

beforeAll(async () => {
  process.env.NEXTAUTH_SECRET ??= "test-secret";
  shop = await makeTestShop("Vane drafts");
  const customer = await prisma.customer.create({ data: { companyId: shop.companyId, name: "Borrowdale Brooke Clinic" } });
  const quote = await prisma.salesQuotation.create({
    data: {
      companyId: shop.companyId,
      customerId: customer.id,
      quotationNumber: `QT-${randomUUID().slice(0, 6)}`,
      quotationDate: new Date("2026-10-07"),
      status: "ACCEPTED",
      subTotal: 620,
      total: 620,
      lines: { create: [{ description: "Vinyl sheet", quantity: 10, unitPrice: 62, lineTotal: 620 }] },
    },
  });
  const castle = await addTestProduct(shop.companyId, { name: "Castle Lager 340ml", price: "1.20", cost: "0.86" }, { siteId: shop.mainId, onHand: 4 });
  const supplier = (await prisma.$transaction((tx) => createSupplier(tx, shop.manager(), { name: "Delta Beverages", email: "orders@delta.co.zw" }))).id;
  Object.assign(ids, { quote: quote.id, supplier, castle: castle.productId });
});

afterAll(async () => {
  if (!shop) return;
  const companyId = shop.companyId;
  await prisma.journalEntry.deleteMany({ where: { companyId } });
  await prisma.salesInvoice.deleteMany({ where: { companyId } });
  await prisma.salesQuotation.deleteMany({ where: { companyId } });
  await prisma.customer.deleteMany({ where: { companyId } });
  await prisma.retailPurchaseOrder.deleteMany({ where: { companyId } });
  await prisma.vendorContact.deleteMany({ where: { companyId } });
  await prisma.vendor.deleteMany({ where: { companyId } });
  await prisma.vaneSettings.deleteMany({ where: { companyId } });
  await destroyProvisionedTenant(companyId);
});

describe("Vane's own drafts", () => {
  it("drafts the invoice for an accepted quote as Vane's, which a person then issues", async () => {
    const drafted = await callTool({ companyId: shop.companyId, jobId: null }, "draft", { kind: "invoice_from_quote", quotationId: ids.quote, dueDate: "2026-11-04" });
    expect(drafted.ok).toBe(true);
    const { invoiceId, invoiceNumber } = JSON.parse(drafted.content);
    expect(await prisma.salesInvoice.findUniqueOrThrow({ where: { id: invoiceId } })).toMatchObject({ status: "DRAFT", madeByVane: true, createdById: null, quotationId: ids.quote });

    // Its page says it is Vane's, what it was made from, and that nothing changed since the quote.
    const record = await readInvoiceRecord(prisma, shop.companyId, invoiceId);
    expect(record).toMatchObject({ status: "DRAFT", stateLabel: "Vane's draft", madeByVane: true, date: "On issue", quote: { number: expect.stringMatching(/^QT-/) }, changes: [] });
    expect(record!.fact).toMatch(/^\$620\.00 to Borrowdale Brooke Clinic, due \d+ days after you issue it\.$/);

    const issued = await action("books.invoice.issue").run(context(), action("books.invoice.issue").params.parse({ invoiceId, invoiceNumber, customer: "Borrowdale Brooke Clinic", total: "USD 620.00" }) as never);
    expect(issued).toBe(`${invoiceNumber} is issued to Borrowdale Brooke Clinic. Send it from Books.`);
    expect(await prisma.salesInvoice.findUniqueOrThrow({ where: { id: invoiceId } })).toMatchObject({ status: "ISSUED", issuedById: shop.managerId });
    // Issued, it is not Vane's to delete.
    await expect(action("books.invoice.discard").run(context(), { invoiceId, invoiceNumber } as never)).rejects.toThrow("was issued");
  });

  it("drafts a reorder as Vane's, sent by nobody", async () => {
    const drafted = await callTool({ companyId: shop.companyId, jobId: null }, "draft", {
      kind: "reorder",
      supplierId: ids.supplier,
      siteId: shop.mainId,
      lines: [{ productId: ids.castle, quantity: 48, unitCost: 0.86 }],
    });
    expect(drafted.ok).toBe(true);
    const { orderId } = JSON.parse(drafted.content);
    expect(await prisma.retailPurchaseOrder.findUniqueOrThrow({ where: { id: orderId } })).toMatchObject({ status: "DRAFT", madeByVane: true, createdById: null, sentAt: null });
  });

  it("drafts nothing while the workspace has Vane's drafts off", async () => {
    await prisma.vaneSettings.create({ data: { companyId: shop.companyId, drafts: false } });
    const refused = await callTool({ companyId: shop.companyId, jobId: null }, "draft", { kind: "invoice_from_quote", quotationId: ids.quote });
    expect(refused).toMatchObject({ ok: false, content: expect.stringContaining("switched off") });
  });
});
