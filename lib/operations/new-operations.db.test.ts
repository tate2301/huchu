/**
 * The operations added for Vane to create and send things, against the test
 * database, each run as the person who approves it: a quote on a deal, the
 * invoice from it, a payment against that invoice (never more than is owed),
 * a lead, an email to someone on the deal (only to an address the record
 * holds), the quote emailed to the client, a person's permission changed (not
 * one's own), and a promotion at the till. Their checks refuse a rep on a deal
 * that is someone else's. Mail is caught, not sent; the PDF is a stand-in.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const { sendEmailMock } = vi.hoisted(() => ({ sendEmailMock: vi.fn() }));
vi.mock("@/lib/email/send", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email/send")>()),
  sendEmail: sendEmailMock,
  isEmailConfigured: () => true,
}));
vi.mock("@/lib/documents/service", () => ({
  renderDocumentSync: vi.fn(async () => ({ fileName: "quote.pdf", data: Buffer.from("pdf") })),
}));

import type { AuthenticatedSession } from "@/lib/auth-core/types";
import { FEATURE_CATALOG } from "@/lib/platform/feature-catalog";
import { destroyProvisionedTenant } from "@/lib/platform/tenant-teardown";
import { prisma } from "@/lib/prisma";
import { makeTestShop, type TestShop } from "@/lib/retail/products/test-fixtures";
import { createMember } from "@/lib/teams/members";

import { findOperation } from "./registry";
import { OperationRefused, outcomeWords, type OperationActor, type OperationOutcome } from "./types";

let shop: TestShop;
const ids = { rep: "", deal: "", client: "", person: "" };
const made = { quoteDoc: "", quotation: "", invoiceDoc: "", invoiceNumber: "" };

const actor = (userId: string, role: string, name: string): OperationActor => ({
  companyId: shop.companyId,
  userId,
  role,
  // Every part of Corelith on, so what is tested is the operation's own checks.
  session: { user: { id: userId, companyId: shop.companyId, role, name, enabledFeatures: FEATURE_CATALOG.map((feature) => feature.key) } } as unknown as AuthenticatedSession,
  requestUrl: "http://corelith.test/api/vane/actions/x",
  via: { kind: "integration", integration: "vane" },
});
const manager = () => actor(shop.managerId, "MANAGER", "Tafara Nyathi");
const rep = () => actor(ids.rep, "SALES_REP", "Rudo Moyo");

/** Runs an operation as a person approving it would: its inputs checked, then its own checks, then the operation. */
async function run(key: string, input: Record<string, unknown>, as: OperationActor = manager()): Promise<OperationOutcome> {
  const operation = findOperation(key)!;
  const parsed = operation.input.parse(input) as never;
  const refusal = await operation.authorize(as, parsed);
  if (refusal) throw new OperationRefused(refusal);
  return operation.run(as, parsed);
}

async function refused(work: Promise<unknown>): Promise<string> {
  try {
    await work;
  } catch (error) {
    if (error instanceof OperationRefused) return error.message;
    throw error;
  }
  throw new Error("Expected it to be refused");
}

const onDeal = () => ({ dealId: ids.deal, record: "Pomona Offices, fit-out" });

beforeAll(async () => {
  process.env.NEXTAUTH_SECRET ??= "test-secret";
  shop = await makeTestShop("Operations");
  const companyId = shop.companyId;
  ids.rep = (await createMember(prisma, { data: { email: `rudo-${randomUUID().slice(0, 6)}@ops.test`, name: "Rudo Moyo", role: "SALES_REP", companyId }, select: { id: true } })).id;
  const pipeline = await prisma.crmPipeline.create({ data: { companyId, name: "Sales", isDefault: true } });
  const stage = await prisma.crmPipelineStage.create({ data: { companyId, pipelineId: pipeline.id, name: "Quoting", position: 1 } });
  const client = await prisma.crmClient.create({ data: { companyId, clientNo: `CL-${randomUUID().slice(0, 6)}`, name: "Pomona Offices", email: "accounts@pomona.example" } });
  const person = await prisma.crmPerson.create({
    data: { companyId, clientId: client.id, personNo: `P-${randomUUID().slice(0, 6)}`, firstName: "Chipo", lastName: "Dube", fullName: "Chipo Dube", email: "chipo@pomona.example" },
  });
  const deal = await prisma.crmDeal.create({
    data: { companyId, dealNo: `D-${randomUUID().slice(0, 6)}`, title: "Fit-out", pipelineId: pipeline.id, stageId: stage.id, clientId: client.id, assignedToId: shop.managerId },
  });
  Object.assign(ids, { deal: deal.id, client: client.id, person: person.id });
});

afterAll(async () => {
  if (!shop) return;
  const companyId = shop.companyId;
  await prisma.crmDocumentApproval.deleteMany({ where: { companyId } }).catch(() => {});
  await prisma.crmLeadDocument.deleteMany({ where: { companyId } });
  await prisma.salesReceipt.deleteMany({ where: { companyId } });
  await prisma.journalEntry.deleteMany({ where: { companyId } });
  await prisma.salesInvoice.deleteMany({ where: { companyId } });
  await prisma.salesQuotation.deleteMany({ where: { companyId } });
  await prisma.crmActivity.deleteMany({ where: { companyId } });
  await prisma.crmLead.deleteMany({ where: { companyId } });
  await prisma.crmDeal.deleteMany({ where: { companyId } });
  await prisma.crmPerson.deleteMany({ where: { companyId } });
  await prisma.crmClient.deleteMany({ where: { companyId } });
  await prisma.customer.deleteMany({ where: { companyId } });
  await prisma.retailPromotion.deleteMany({ where: { companyId } });
  await prisma.userPermissionOverride.deleteMany({ where: { companyId } }).catch(() => {});
  await destroyProvisionedTenant(companyId);
});

describe("documents on a deal", () => {
  it("writes a quote as the person who approved it, filed on the deal", async () => {
    const outcome = await run("crm.quote.create", {
      ...onDeal(),
      lines: [
        { description: "Carpet tiles, supply and lay (m²)", quantity: 212.4, unitPrice: 38.5 },
        { description: "Underlay (m²)", quantity: 212.4, unitPrice: 6 },
      ],
      validUntil: "2026-11-15",
    });
    expect(outcomeWords(outcome)).toMatch(/is ready for Pomona Offices, fit-out, \$9,451\.80\. Send it from the quote\.$/);
    const doc = await prisma.crmLeadDocument.findFirstOrThrow({ where: { dealId: ids.deal, type: "QUOTATION" }, include: { quotation: true } });
    expect(doc).toMatchObject({ createdById: shop.managerId, quotation: { status: "SENT", createdById: shop.managerId, total: 9451.8 } });
    expect(typeof outcome === "object" && outcome.record).toEqual({ id: doc.id, href: `/crm/quotes/${doc.id}` });
    Object.assign(made, { quoteDoc: doc.id, quotation: doc.quotationId! });
  });

  it("invoices the deal from its quote, issued and posted", async () => {
    const outcome = await run("crm.invoice.create", { ...onDeal(), fromQuotationId: made.quotation, fromQuote: "the quote", dueDate: "2026-11-30" });
    expect(outcomeWords(outcome)).toMatch(/is issued to Pomona Offices, fit-out, \$9,451\.80, and posted to the books\.$/);
    const doc = await prisma.crmLeadDocument.findFirstOrThrow({ where: { dealId: ids.deal, type: "INVOICE" }, include: { invoice: true } });
    expect(doc.invoice).toMatchObject({ status: "ISSUED", total: 9451.8 });
    Object.assign(made, { invoiceDoc: doc.id, invoiceNumber: doc.invoice!.invoiceNumber });
  });

  it("records a payment against the invoice, and never more than is owed", async () => {
    const pay = (amount: number) =>
      run("crm.receipt.record", { ...onDeal(), invoiceDocumentId: made.invoiceDoc, invoiceNumber: made.invoiceNumber, amount, method: "Bank transfer", reference: "FBC 4471" });
    expect(outcomeWords(await pay(5000))).toBe(`$5,000.00 is recorded against ${made.invoiceNumber}.`);
    expect(await refused(pay(9000))).toMatch(/more than|exceeds|outstanding/i);
  });

  it("refuses a rep on a deal that is someone else's", async () => {
    const lines = [{ description: "Screed (m²)", quantity: 10, unitPrice: 18.5 }];
    expect(await refused(run("crm.quote.create", { ...onDeal(), lines }, rep()))).toBe("That deal is someone else's, and you can change only your own.");
  });
});

describe("leads and email", () => {
  it("adds a lead, numbered and scored, as the person", async () => {
    const outcome = await run("crm.lead.create", { title: "Vinyl for three consulting rooms", contactName: "Dr Ncube", contactPhone: "+263 77 123 4567", source: "Email" });
    const lead = await prisma.crmLead.findFirstOrThrow({ where: { companyId: shop.companyId, title: "Vinyl for three consulting rooms" } });
    expect(lead).toMatchObject({ createdById: shop.managerId, contactName: "Dr Ncube" });
    expect(outcomeWords(outcome)).toBe(`${lead.leadNo} is added: Vinyl for three consulting rooms.`);
  });

  it("emails someone on the deal, from the workspace's name, and logs it on the deal", async () => {
    sendEmailMock.mockClear();
    const outcome = await run("crm.email.send", {
      to: "Chipo@Pomona.example",
      toName: "Chipo Dube",
      subject: "Your floor, measured",
      message: "Good afternoon Chipo,\n\nWe measured 212.4 m². The quote follows today.",
      about: "Pomona Offices, fit-out",
      dealId: ids.deal,
    });
    expect(outcomeWords(outcome)).toBe("Sent to Chipo Dube (chipo@pomona.example), and logged on Pomona Offices, fit-out.");
    expect(sendEmailMock).toHaveBeenCalledWith(expect.objectContaining({ to: "chipo@pomona.example", subject: "Your floor, measured" }));
    expect(await prisma.crmActivity.findFirst({ where: { dealId: ids.deal, type: "EMAIL", subject: "Your floor, measured" } })).not.toBeNull();
  });

  it("sends nothing to an address the record does not hold", async () => {
    sendEmailMock.mockClear();
    const why = await refused(run("crm.email.send", { to: "someone@else.example", subject: "Hi", message: "Hello", about: "Pomona Offices, fit-out", dealId: ids.deal }));
    expect(why).toMatch(/is not an address on that record/);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("emails the quote to the client, with its PDF", async () => {
    sendEmailMock.mockClear();
    const outcome = await run("crm.document.email", { ...onDeal(), documentId: made.quoteDoc, number: "the quote", message: "Here is the quote we spoke about." });
    expect(outcomeWords(outcome)).toBe("the quote went to accounts@pomona.example.");
    expect(sendEmailMock).toHaveBeenCalledWith(expect.objectContaining({ to: "accounts@pomona.example", attachments: expect.any(Array) }));
  });
});

describe("people and promotions", () => {
  it("changes what a person may do, and not one's own", async () => {
    const change = (userId: string, as = manager()) =>
      run("people.permission.set", { userId, person: "Rudo Moyo", kind: "CAPABILITY", key: "documents.issue", permission: "Issue quotes and invoices", state: "DENY" }, as);
    expect(outcomeWords(await change(ids.rep))).toBe('Rudo Moyo: "Issue quotes and invoices" is now deny.');
    expect(await prisma.userPermissionOverride.findFirst({ where: { membership: { userId: ids.rep }, permissionKey: "documents.issue" } })).toMatchObject({ isAllowed: false });
    expect(await refused(change(shop.managerId))).toBe("You cannot change your own permissions.");
    expect(await refused(change(shop.managerId, rep()))).toMatch(/Only an admin or manager|cannot/);
  });

  it("starts a promotion at the till, checked as the Promotions page checks it", async () => {
    const promo = { name: "Cider week", kind: "PERCENT", value: "15", appliesTo: "EVERYTHING", starts: "2030-01-05", ends: "2030-01-12", what: "everything" };
    const outcome = await run("retail.promotion.create", promo, actor(shop.ownerId, "SUPERADMIN", "Tendai Mhlanga"));
    expect(typeof outcome === "object" && outcome.record?.href).toMatch(/^\/retail\/products\/promotions\//);
    expect(await refused(run("retail.promotion.create", { ...promo, name: "Too much", value: "95" }, actor(shop.ownerId, "SUPERADMIN", "Tendai Mhlanga")))).toMatch(/90/);
  });
});
