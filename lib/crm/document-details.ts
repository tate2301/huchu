import { z } from "zod";

import type { AuthenticatedSession } from "@/lib/auth-core/types";
import { DueDateRefused, setInvoiceDueDate } from "@/lib/books/due-dates";
import { canEditRecord, canUser, denialMessage } from "@/lib/crm/permissions";
import { prisma } from "@/lib/prisma";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a day");

/** What can still change on a document once its figures cannot: an invoice's due date; a receipt's method and reference. */
export const documentDetailsSchema = z.union([
  z.object({ dueDate: day }),
  z.object({
    method: z.string().trim().min(1, "Say how it was paid").max(60),
    reference: z.string().trim().max(120).nullable(),
  }),
]);

export type DocumentDetails = z.infer<typeof documentDetailsSchema>;

/** Why a detail was not changed, in a sentence, with the status the route answers. */
export class DocumentDetailsRefused extends Error {
  constructor(
    readonly status: 400 | 403 | 404 | 409,
    message: string,
  ) {
    super(message);
    this.name = "DocumentDetailsRefused";
  }
}

const longDay = (value: string) => new Date(`${value}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/**
 * Changes what makes sense to change on a CRM document whatever has been
 * paid against it: an invoice's due date (not once it is paid or void), a
 * receipt's method and reference (labels only: the amount, the day and the
 * account it went to are in the books and stay). A quote's changes are its
 * Edit and Revise. As the person who may edit the record and issue documents;
 * the record's history says what changed.
 */
export async function changeDocumentDetails(session: AuthenticatedSession, documentId: string, details: DocumentDetails) {
  const companyId = session.user.companyId;
  const doc = await prisma.crmLeadDocument.findFirst({
    where: { id: documentId, companyId },
    select: {
      id: true,
      type: true,
      leadId: true,
      dealId: true,
      invoiceId: true,
      receiptId: true,
      lead: { select: { assignedToId: true, clientId: true } },
      deal: { select: { assignedToId: true, clientId: true } },
      receipt: { select: { receiptNumber: true, method: true, reference: true } },
    },
  });
  if (!doc) throw new DocumentDetailsRefused(404, "Document not found");
  if (!(await canEditRecord(session, doc.deal?.assignedToId ?? doc.lead?.assignedToId ?? null))) {
    throw new DocumentDetailsRefused(403, "You can only change documents on records assigned to you");
  }
  if (!(await canUser(session, "documents.issue"))) throw new DocumentDetailsRefused(403, denialMessage("documents.issue"));

  let subject: string;
  if ("dueDate" in details) {
    if (doc.type !== "INVOICE" || !doc.invoiceId) throw new DocumentDetailsRefused(400, "Only an invoice has a due date.");
    try {
      const set = await setInvoiceDueDate(prisma, { companyId, invoiceId: doc.invoiceId, dueDate: details.dueDate });
      subject = `${set.invoiceNumber} is now due on ${longDay(set.dueDate)}`;
    } catch (error) {
      if (error instanceof DueDateRefused) throw new DocumentDetailsRefused(409, error.message);
      throw error;
    }
  } else {
    if (doc.type !== "RECEIPT" || !doc.receiptId || !doc.receipt) throw new DocumentDetailsRefused(400, "Only a receipt has a method and a reference.");
    await prisma.salesReceipt.update({
      where: { id: doc.receiptId },
      data: { method: details.method, reference: details.reference || null },
    });
    subject = `${doc.receipt.receiptNumber} now says ${details.method}${details.reference ? `, ${details.reference}` : ""}`;
  }

  await prisma.crmActivity.create({
    data: {
      companyId,
      type: "SYSTEM",
      leadId: doc.leadId ?? undefined,
      dealId: doc.dealId ?? undefined,
      clientId: doc.deal?.clientId ?? doc.lead?.clientId ?? undefined,
      subject,
      metadata: { leadDocumentId: doc.id },
      createdById: session.user.id,
      occurredAt: new Date(),
    },
  });
  return { subject };
}
