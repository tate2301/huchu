/**
 * Accounting → CRM.
 *
 * `accounting-bridge.ts` handles the direction everyone thinks of first: the
 * CRM cuts a quote, an invoice, a receipt. But a bookkeeper raising the invoice
 * in Accounting against a quote the CRM produced is just as real, and until now
 * the CRM never heard about it — the deal sat at "quoted" while the money came
 * in, and the rep chased a customer who had already paid.
 *
 * These hooks close that loop. Every one of them is deliberately
 * non-throwing: a CRM bookkeeping failure must never fail the accounting
 * request that triggered it. Accounting is the system of record for money; the
 * CRM is downstream of it here.
 */
import { prisma } from "@corelithzw/db/client";
import { recalcSalesInvoiceBalance } from "@corelithzw/module-books/balances";
import { emitCrmNotification } from "./notifications";
import { runAutomations } from "./automation-runner";

type CrmOwnerRef = { leadId: string | null; dealId: string | null; clientId: string | null };

/** Where a CRM record lives, for a notification's deep link. */
function ownerPath(owner: CrmOwnerRef): string {
  if (owner.dealId) return `/crm/deals/${owner.dealId}`;
  if (owner.leadId) return `/crm/leads/${owner.leadId}`;
  return "/crm";
}

async function ownerAssignee(owner: CrmOwnerRef): Promise<string | null> {
  if (owner.dealId) {
    const deal = await prisma.crmDeal.findUnique({
      where: { id: owner.dealId },
      select: { assignedToId: true },
    });
    return deal?.assignedToId ?? null;
  }
  if (owner.leadId) {
    const lead = await prisma.crmLead.findUnique({
      where: { id: owner.leadId },
      select: { assignedToId: true },
    });
    return lead?.assignedToId ?? null;
  }
  return null;
}

/**
 * Close a record out once its invoice is settled in full.
 *
 * Extracted from the CRM-side receipt path so both directions settle a record
 * exactly the same way. A deal's won stage comes from its own pipeline rather
 * than a fixed name, so it is looked up rather than assumed.
 */
export async function settleCrmRecordIfPaid(
  companyId: string,
  owner: CrmOwnerRef,
  invoiceId: string,
): Promise<boolean> {
  const balance = await recalcSalesInvoiceBalance(invoiceId);
  if (!balance || !("status" in balance) || balance.status !== "PAID") return false;

  if (owner.leadId) {
    await prisma.crmLead.updateMany({
      where: { id: owner.leadId, companyId, stage: { not: "LOST" } },
      data: { stage: "WON", wonAt: new Date() },
    });
    return true;
  }

  if (owner.dealId) {
    const deal = await prisma.crmDeal.findFirst({
      where: { id: owner.dealId, companyId, status: "OPEN" },
      select: { id: true, pipelineId: true },
    });
    if (!deal) return false;
    const wonStage = await prisma.crmPipelineStage.findFirst({
      where: { pipelineId: deal.pipelineId, status: "WON", archivedAt: null },
      select: { id: true, probability: true },
    });
    if (!wonStage) return false;

    await prisma.crmDeal.update({
      where: { id: deal.id },
      data: {
        stageId: wonStage.id,
        status: "WON",
        probability: wonStage.probability,
        forecastCategory: "CLOSED",
        wonAt: new Date(),
        stageEnteredAt: new Date(),
      },
    });
    return true;
  }

  return false;
}

/**
 * An invoice was raised in Accounting from a CRM quotation.
 *
 * Adopts it into the CRM: the document appears on the record, the timeline says
 * so, the lead moves to invoiced, and the owner is told. Only fires for
 * invoices that actually trace back to a CRM quote — an invoice typed straight
 * into Accounting for something the CRM never touched is left alone.
 */
export async function onAccountingInvoiceCreated(input: {
  companyId: string;
  invoiceId: string;
  userId: string;
}): Promise<void> {
  try {
    const invoice = await prisma.salesInvoice.findFirst({
      where: { id: input.invoiceId, companyId: input.companyId },
      select: {
        id: true,
        invoiceNumber: true,
        total: true,
        currency: true,
        status: true,
        quotationId: true,
      },
    });
    if (!invoice?.quotationId) return;

    // The quote's CRM document is what tells us which record this belongs to.
    const quoteDoc = await prisma.crmLeadDocument.findFirst({
      where: {
        companyId: input.companyId,
        quotationId: invoice.quotationId,
        type: "QUOTATION",
      },
      select: { id: true, leadId: true, dealId: true },
    });
    if (!quoteDoc) return;

    // Idempotent: the CRM's own invoice path already created this document, and
    // a retried accounting request must not produce a second one.
    const existing = await prisma.crmLeadDocument.findFirst({
      where: { companyId: input.companyId, invoiceId: invoice.id },
      select: { id: true },
    });
    if (existing) return;

    const owner: CrmOwnerRef = {
      leadId: quoteDoc.leadId,
      dealId: quoteDoc.dealId,
      clientId: null,
    };

    await prisma.crmLeadDocument.create({
      data: {
        companyId: input.companyId,
        leadId: quoteDoc.leadId ?? undefined,
        dealId: quoteDoc.dealId ?? undefined,
        type: "INVOICE",
        invoiceId: invoice.id,
        amount: invoice.total,
        currency: invoice.currency,
        createdById: input.userId,
      },
    });

    await prisma.crmActivity.create({
      data: {
        companyId: input.companyId,
        type: "SYSTEM",
        leadId: quoteDoc.leadId ?? undefined,
        dealId: quoteDoc.dealId ?? undefined,
        subject: `Invoice ${invoice.invoiceNumber} raised in Accounting`,
        metadata: { kind: "DOCUMENT_INVOICED", invoiceId: invoice.id, origin: "ACCOUNTING" },
        createdById: input.userId,
        occurredAt: new Date(),
      },
    });

    // A draft invoice isn't a commitment yet, so the stage only moves once it
    // has actually been issued.
    if (invoice.status === "ISSUED" && quoteDoc.leadId) {
      await prisma.crmLead.updateMany({
        where: {
          id: quoteDoc.leadId,
          companyId: input.companyId,
          stage: { in: ["NEW", "CONTACTED", "QUALIFIED", "SITE_VISIT", "QUOTED"] },
        },
        data: { stage: "INVOICED" },
      });
    }

    const assignee = await ownerAssignee(owner);
    if (assignee && assignee !== input.userId) {
      await emitCrmNotification({
        companyId: input.companyId,
        recipientIds: [assignee],
        type: "CRM_DOCUMENT_APPROVED",
        title: `Invoice ${invoice.invoiceNumber} was raised for your ${quoteDoc.dealId ? "deal" : "lead"}`,
        summary: "Accounting raised it from your quote.",
        leadId: quoteDoc.leadId ?? undefined,
        viewPath: ownerPath(owner),
      });
    }

    await runAutomations({
      companyId: input.companyId,
      trigger: "DOCUMENT_APPROVED",
      entity: quoteDoc.dealId ? "DEAL" : "LEAD",
      recordId: (quoteDoc.dealId ?? quoteDoc.leadId)!,
      record: { invoiceId: invoice.id, amount: invoice.total, origin: "ACCOUNTING" },
      actorId: input.userId,
    });
  } catch (error) {
    console.error("[CRM] onAccountingInvoiceCreated failed:", error);
  }
}

/**
 * A receipt was recorded in Accounting against an invoice the CRM owns.
 *
 * The same consequences as taking the payment in the CRM: the receipt shows on
 * the record, the timeline says so, and a fully-settled invoice closes the
 * record as won.
 */
export async function onAccountingReceiptCreated(input: {
  companyId: string;
  receiptId: string;
  invoiceId: string | null;
  userId: string;
}): Promise<void> {
  try {
    if (!input.invoiceId) return;

    const invoiceDoc = await prisma.crmLeadDocument.findFirst({
      where: { companyId: input.companyId, invoiceId: input.invoiceId, type: "INVOICE" },
      select: { id: true, leadId: true, dealId: true, currency: true },
    });
    // Not a CRM invoice — Accounting is free to take money for anything.
    if (!invoiceDoc) return;

    const receipt = await prisma.salesReceipt.findFirst({
      where: { id: input.receiptId, companyId: input.companyId },
      select: { id: true, receiptNumber: true, amount: true },
    });
    if (!receipt) return;

    const existing = await prisma.crmLeadDocument.findFirst({
      where: { companyId: input.companyId, receiptId: receipt.id },
      select: { id: true },
    });
    if (existing) return;

    const owner: CrmOwnerRef = {
      leadId: invoiceDoc.leadId,
      dealId: invoiceDoc.dealId,
      clientId: null,
    };

    const doc = await prisma.crmLeadDocument.create({
      data: {
        companyId: input.companyId,
        leadId: invoiceDoc.leadId ?? undefined,
        dealId: invoiceDoc.dealId ?? undefined,
        type: "RECEIPT",
        receiptId: receipt.id,
        amount: receipt.amount,
        currency: invoiceDoc.currency,
        createdById: input.userId,
      },
      select: { id: true },
    });

    await prisma.crmActivity.create({
      data: {
        companyId: input.companyId,
        type: "PAYMENT_RECORDED",
        leadId: invoiceDoc.leadId ?? undefined,
        dealId: invoiceDoc.dealId ?? undefined,
        subject: `Payment ${receipt.receiptNumber} recorded in Accounting`,
        metadata: {
          documentId: doc.id,
          receiptId: receipt.id,
          amount: receipt.amount,
          origin: "ACCOUNTING",
        },
        createdById: input.userId,
      },
    });

    const settled = await settleCrmRecordIfPaid(input.companyId, owner, input.invoiceId);

    const assignee = await ownerAssignee(owner);
    if (assignee && assignee !== input.userId) {
      await emitCrmNotification({
        companyId: input.companyId,
        recipientIds: [assignee],
        type: "CRM_DOCUMENT_APPROVED",
        title: settled
          ? `Paid in full — ${receipt.receiptNumber}`
          : `Payment ${receipt.receiptNumber} received`,
        summary: settled
          ? "The invoice is settled and the record is closed as won."
          : `${receipt.amount} received against your invoice.`,
        leadId: invoiceDoc.leadId ?? undefined,
        viewPath: ownerPath(owner),
      });
    }

    await runAutomations({
      companyId: input.companyId,
      trigger: "PAYMENT_RECEIVED",
      entity: invoiceDoc.dealId ? "DEAL" : "LEAD",
      recordId: (invoiceDoc.dealId ?? invoiceDoc.leadId)!,
      record: { amount: receipt.amount, settled, origin: "ACCOUNTING" },
      actorId: input.userId,
    });
  } catch (error) {
    console.error("[CRM] onAccountingReceiptCreated failed:", error);
  }
}
