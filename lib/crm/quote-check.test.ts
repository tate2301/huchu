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

import { changeLineToListedPrice, checkQuoteAgainstPriceList, QuoteCheckRefused } from "./quote-check";

const SLUG = "crm-quote-check-test";
const ids = { company: "", manager: "", rep: "", lead: "", doc: "" };

const session = (userId: string, role: string) =>
  ({ user: { id: userId, companyId: ids.company, role, name: "Tendai" } }) as unknown as AuthenticatedSession;

async function clear() {
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
  ids.doc = quote.leadDocumentId;
});

afterAll(async () => {
  await clear();
  await prisma.user.deleteMany({ where: { companyId: ids.company } });
  await prisma.company.delete({ where: { id: ids.company } }).catch(() => {});
});

describe("a quote checked against the price list", () => {
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
