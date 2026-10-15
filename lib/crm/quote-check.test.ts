/**
 * A CRM quote checked against the price list, against the test database: a
 * line priced under the list is found with what the list says and since when;
 * a line that matches, and one typed by hand, are counted, not flagged; and
 * "Change the line" moves just that line to the list's price, as a person who
 * may edit the quote, and is refused to one who may not.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AuthenticatedSession } from "@/lib/auth-core/types";
import { createQuotationForLead } from "@/lib/crm/accounting-bridge";
import { prisma } from "@/lib/prisma";

import { changeLineToListedPrice, checkQuoteAgainstPriceList, QuoteCheckRefused, vaneQuoteMessageSent } from "./quote-check";

const SLUG = "crm-quote-check-test";
const ids = { company: "", manager: "", rep: "", lead: "", doc: "", underlay: "" };

const session = (userId: string, role: string) =>
  ({ user: { id: userId, companyId: ids.company, role, name: "Tendai" } }) as unknown as AuthenticatedSession;

async function clear() {
  await prisma.vaneItem.deleteMany({ where: { companyId: ids.company } });
  await prisma.crmActivity.deleteMany({ where: { companyId: ids.company } });
  await prisma.crmLeadDocument.deleteMany({ where: { companyId: ids.company } });
  await prisma.salesQuotation.deleteMany({ where: { companyId: ids.company } });
  await prisma.crmLead.deleteMany({ where: { companyId: ids.company } });
  await prisma.product.deleteMany({ where: { companyId: ids.company } });
}

beforeAll(async () => {
  const company = await prisma.company.upsert({ where: { slug: SLUG }, update: {}, create: { name: "Quote check", slug: SLUG } });
  ids.company = company.id;
  await clear();
  const user = (email: string, role: string) =>
    prisma.user.upsert({ where: { email }, update: { role: role as never }, create: { email, name: email.split("@")[0], companyId: company.id, role: role as never } });
  ids.manager = (await user(`manager-${SLUG}@crm.test`, "MANAGER")).id;
  ids.rep = (await user(`rep-${SLUG}@crm.test`, "SALES_REP")).id;

  await prisma.product.createMany({
    data: [
      { companyId: company.id, code: "UND-1", name: "Underlay", standardPrice: 49.8, unit: "OTHER", unitLabel: "roll" },
      { companyId: company.id, code: "LAM-1", name: "Laminate planks, oak", standardPrice: 24.5 },
    ],
  });
  // Someone else's lead: the rep may not edit its quote.
  const lead = await prisma.crmLead.create({
    data: { companyId: company.id, leadNo: "LEAD-QC-1", title: "Pomona Offices", contactName: "Rudo", assignedToId: ids.manager },
  });
  ids.lead = lead.id;
  const quote = await createQuotationForLead({
    companyId: company.id,
    userId: ids.manager,
    leadId: lead.id,
    lines: [
      { description: "Laminate planks, oak", quantity: 13, unitPrice: 24.5 },
      { description: "underlay", quantity: 2, unitPrice: 46.5 },
      { description: "Fitting", quantity: 27.92, unitPrice: 6 },
    ],
  });
  ids.underlay = (await prisma.product.findFirstOrThrow({ where: { companyId: company.id, code: "UND-1" } })).id;
  ids.doc = quote.leadDocumentId;
});

afterAll(async () => {
  await clear();
  await prisma.user.deleteMany({ where: { companyId: ids.company } });
  await prisma.company.delete({ where: { id: ids.company } }).catch(() => {});
});

describe("a quote checked against the price list", () => {
  it("checks a line by the product it was picked from, whatever its words say", async () => {
    const lead = await prisma.crmLead.create({ data: { companyId: ids.company, leadNo: "LEAD-QC-2", title: "Picked", contactName: "Rudo", assignedToId: ids.manager } });
    const quote = await createQuotationForLead({
      companyId: ids.company,
      userId: ids.manager,
      leadId: lead.id,
      lines: [{ description: "Underlay, grey (10% discount applied)", quantity: 2, unitPrice: 44.82, productId: ids.underlay }],
    });
    const line = await prisma.salesQuotationLine.findFirstOrThrow({ where: { quotation: { crmLeadDocuments: { some: { id: quote.leadDocumentId } } } } });
    expect(line.productId).toBe(ids.underlay);
    const check = await checkQuoteAgainstPriceList(ids.company, quote.leadDocumentId);
    expect(check).toMatchObject({ checked: 1, unpriced: 0, findings: [{ position: 0, quoted: 44.82, listed: 49.8 }] });
  });

  it("finds the line priced under the list, and counts the rest", async () => {
    const check = await checkQuoteAgainstPriceList(ids.company, ids.doc);
    expect(check).toMatchObject({
      currency: "USD",
      checked: 2,
      unpriced: 1,
      editLock: null,
      findings: [{ position: 1, description: "underlay", quoted: 46.5, listed: 49.8, unit: "roll" }],
    });
    expect(await checkQuoteAgainstPriceList(ids.company, "00000000-0000-4000-8000-000000000000")).toBeNull();
  });

  it("refuses to change a line for a person who may not edit the quote", async () => {
    await expect(changeLineToListedPrice(session(ids.rep, "SALES_REP"), ids.doc, 1)).rejects.toBeInstanceOf(QuoteCheckRefused);
  });

  it("changes just that line to the list's price, and then it matches", async () => {
    const changed = await changeLineToListedPrice(session(ids.manager, "MANAGER"), ids.doc, 1);
    expect(changed).toMatchObject({ description: "underlay", listed: 49.8 });
    const doc = await prisma.crmLeadDocument.findUniqueOrThrow({
      where: { id: ids.doc },
      select: { quotation: { select: { total: true, lines: { orderBy: { createdAt: "asc" }, select: { description: true, unitPrice: true } } } } },
    });
    expect(doc.quotation?.lines.map((line) => [line.description, line.unitPrice])).toEqual([
      ["Laminate planks, oak", 24.5],
      ["underlay", 49.8],
      ["Fitting", 6],
    ]);
    expect((await checkQuoteAgainstPriceList(ids.company, ids.doc))?.findings).toEqual([]);
    await expect(changeLineToListedPrice(session(ids.manager, "MANAGER"), ids.doc, 1)).rejects.toThrow("already matches");
  });
});

describe("the message Vane wrote to go with the quote", () => {
  it("is its open card about the quote whose button sends, done by the person who sends it", async () => {
    const card = (body: string, type: string, subjectId = ids.doc) =>
      prisma.vaneItem.create({
        data: { companyId: ids.company, kind: "SUGGESTION", sourceModule: "crm", headline: "The quote is ready to go", body, action: { type, label: "Send the quote" }, subjectType: "CrmLeadDocument", subjectId },
      });
    const other = await card("Not about this quote.", "send", "00000000-0000-4000-8000-000000000000");
    await card("Ring them first.", "open");
    const message = await card("Good afternoon. Here is the quote for the lounge and passage.", "send");

    const check = await checkQuoteAgainstPriceList(ids.company, ids.doc);
    expect(check?.message).toEqual({ itemId: message.id, text: "Good afternoon. Here is the quote for the lounge and passage." });
    expect(check?.basePath).toBe(`/api/v2/crm/leads/${ids.lead}`);

    // Only that card, about this quote, is taken further, and by the sender.
    expect(await vaneQuoteMessageSent({ companyId: ids.company, userId: ids.manager, itemId: other.id, documentId: ids.doc })).toBe(false);
    expect(await vaneQuoteMessageSent({ companyId: ids.company, userId: ids.manager, itemId: message.id, documentId: ids.doc })).toBe(true);
    expect(await prisma.vaneItem.findUniqueOrThrow({ where: { id: message.id } })).toMatchObject({ status: "DONE", resolvedById: ids.manager });
    expect((await checkQuoteAgainstPriceList(ids.company, ids.doc))?.message).toBeNull();
  });
});
