/**
 * A quote goes to the company's address as it is now, not as it was when the
 * company was first billed.
 *
 * The first quote copies the company onto an accounting customer, and the
 * send read the address off that copy. Editing the company's email afterwards
 * changed the company and never the copy, so every quote and invoice kept
 * going to the old address.
 *
 * The PDF renderer and the mail provider are mocked; the records are real.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/prisma";

const { sendEmailMock } = vi.hoisted(() => ({ sendEmailMock: vi.fn() }));

vi.mock("@/lib/email/send", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email/send")>()),
  sendEmail: sendEmailMock,
}));
vi.mock("@/lib/documents/service", () => ({
  renderDocumentSync: vi.fn(async () => ({ fileName: "quote.pdf", data: Buffer.from("pdf") })),
}));

const { emailDocumentToClient } = await import("./document-email");

const SLUG = "crm-document-email-recipient-test";

let companyId: string;
let clientId: string;
let customerId: string;
let documentId: string;

beforeAll(async () => {
  await prisma.company.deleteMany({ where: { slug: SLUG } });
  companyId = (await prisma.company.create({ data: { name: SLUG, slug: SLUG } })).id;

  // As the first quote left it: the copy holds the address of the day.
  customerId = (
    await prisma.customer.create({
      data: { companyId, name: "Msasa Property Group", email: "old@msasa.example" },
    })
  ).id;
  clientId = (
    await prisma.crmClient.create({
      data: {
        companyId,
        clientNo: "CRMC-T1",
        name: "Msasa Property Group",
        email: "old@msasa.example",
        customerId,
      },
    })
  ).id;

  const pipeline = await prisma.crmPipeline.create({ data: { companyId, name: "Sales", isDefault: true } });
  const stage = await prisma.crmPipelineStage.create({
    data: { companyId, pipelineId: pipeline.id, name: "Quoted", position: 1 },
  });
  const deal = await prisma.crmDeal.create({
    data: { companyId, dealNo: "D-T1", title: "Fit-out", pipelineId: pipeline.id, stageId: stage.id, clientId },
  });
  const quotation = await prisma.salesQuotation.create({
    data: { companyId, customerId, quotationNumber: "QT-T1", quotationDate: new Date() },
  });
  documentId = (
    await prisma.crmLeadDocument.create({
      data: { companyId, type: "QUOTATION", amount: 100, dealId: deal.id, quotationId: quotation.id },
    })
  ).id;

  // Then somebody corrects the company's email in the CRM.
  await prisma.crmClient.update({ where: { id: clientId }, data: { email: "accounts@msasa.example" } });
});

afterAll(async () => {
  await prisma.company.deleteMany({ where: { slug: SLUG } });
});

describe("emailing a document to the client", () => {
  it("sends to the company's current address and brings its billing copy up to date", async () => {
    const sent = await emailDocumentToClient({ companyId, leadDocumentId: documentId });

    expect(sent.to).toBe("accounts@msasa.example");
    expect(sendEmailMock).toHaveBeenCalledWith(expect.objectContaining({ to: "accounts@msasa.example" }));
    // The PDF prints the customer under "Prepared For", so the copy moves too.
    const customer = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
    expect(customer.email).toBe("accounts@msasa.example");
  });
});
