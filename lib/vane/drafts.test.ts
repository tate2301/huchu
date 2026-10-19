/**
 * Vane's own drafts, against the test database, through the `draft` tool:
 * an accepted quote becomes a draft invoice made by Vane with no person as
 * its maker, which a person issues (posting it) or Vane's discard deletes; a
 * reorder becomes a draft order made by Vane, which nobody has sent; and with
 * drafts switched off, nothing is drafted. Below them, the rule every route
 * that issues, sends or posts one keeps (`takeOn`), and its dates.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AuthenticatedSession } from "@/lib/auth-core/types";
import { prisma } from "@/lib/prisma";
import { destroyProvisionedTenant } from "@/lib/platform/tenant-teardown";
import { createSupplier } from "@/lib/retail/buying/suppliers";
import { addTestProduct, makeTestShop, type TestShop } from "@/lib/retail/products/test-fixtures";

import { readInvoiceRecord } from "@/lib/books/invoice-record";

import { OPERATIONS } from "@/lib/operations/registry";
import type { OperationActor } from "@/lib/operations/types";
import { datesOnIssue, takeOn, usualTerms, VaneDraftNotTakenOn, waitsForAPerson } from "./drafts";
import { callTool } from "./tools";

let shop: TestShop;
const ids = { quote: "", supplier: "", castle: "" };

const context = (): OperationActor => ({
  companyId: shop.companyId,
  userId: shop.managerId,
  role: "MANAGER",
  session: { user: { id: shop.managerId, companyId: shop.companyId, role: "MANAGER", name: "Tafara" } } as unknown as AuthenticatedSession,
  requestUrl: "http://vane.test/api/vane/actions/x",
  via: { kind: "integration", integration: "vane" },
});
const action = (kind: string) => OPERATIONS.find((row) => row.key === kind)!;

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

    const issued = await action("books.invoice.issue").run(context(), action("books.invoice.issue").input.parse({ invoiceId, invoiceNumber, customer: "Borrowdale Brooke Clinic", total: "USD 620.00" }) as never);
    // A draft carries no number (D8); it is numbered from the series when issued.
    expect(invoiceNumber).toBeNull();
    expect(issued).toMatch(/^INV-\d{4,} is issued to Borrowdale Brooke Clinic\. Send it from Books\.$/);
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

const d = (day: string) => new Date(`${day}T00:00:00Z`);

describe("Vane's drafts", () => {
  it("wait for a person while Vane made them and nobody has taken them on", () => {
    expect(waitsForAPerson({ madeByVane: true, createdById: null })).toBe(true);
    expect(waitsForAPerson({ madeByVane: true, createdById: "rudo" })).toBe(false);
    expect(waitsForAPerson({ madeByVane: false, createdById: null })).toBe(false);
  });

  it("are refused without asMine, and make the person their maker with it", () => {
    const draft = { madeByVane: true, createdById: null };
    expect(() => takeOn(draft, { userId: "rudo", what: "INV-0143", verb: "issue" })).toThrow(VaneDraftNotTakenOn);
    expect(() => takeOn(draft, { userId: "rudo", what: "INV-0143", verb: "issue" })).toThrow("INV-0143 is Vane’s draft. Check it and confirm it as yours to issue it.");
    expect(takeOn(draft, { asMine: true, userId: "rudo", what: "INV-0143", verb: "issue" })).toEqual({ createdById: "rudo" });
    // A person's own record, or one already taken on, keeps its maker.
    expect(takeOn({ madeByVane: true, createdById: "james" }, { asMine: true, userId: "rudo", what: "x", verb: "issue" })).toEqual({});
    expect(takeOn({ madeByVane: false, createdById: "james" }, { userId: "rudo", what: "x", verb: "issue" })).toEqual({});
  });

  it("are dated the day they are issued, due the same days on", () => {
    expect(datesOnIssue({ invoiceDate: d("2026-10-07"), dueDate: d("2026-10-28") }, new Date("2026-10-14T09:12:00Z"))).toEqual({
      invoiceDate: d("2026-10-14"),
      dueDate: d("2026-11-04"),
    });
    expect(datesOnIssue({ invoiceDate: d("2026-10-07"), dueDate: null }, d("2026-10-14"))).toEqual({ invoiceDate: d("2026-10-14"), dueDate: null });
  });

  it("read a customer's usual terms off their invoices, newest first winning a tie", () => {
    const invoice = (from: string, to: string | null) => ({ invoiceDate: d(from), dueDate: to ? d(to) : null });
    expect(usualTerms([invoice("2026-09-01", "2026-09-22"), invoice("2026-08-01", "2026-08-22"), invoice("2026-07-01", "2026-07-31")])).toBe(21);
    expect(usualTerms([invoice("2026-09-01", "2026-10-01"), invoice("2026-08-01", "2026-08-15")])).toBe(30);
    expect(usualTerms([invoice("2026-09-01", null)])).toBeNull();
  });
});
