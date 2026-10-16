import type { Prisma, PrismaClient } from "@prisma/client";

import { writePlatformAuditEvent } from "@/lib/audit/platform";
import { isRouteAllowedForRole } from "@/lib/auth-core/role-routes";
import { prisma } from "@/lib/prisma";

import { InvoiceChangeRefused, isWorkspaceOwner, OWNER_ONLY, type InvoiceActor } from "./owner";
import { REASON_MAX, REASON_MIN, type InvoiceRemoval } from "./reversal";

/**
 * Deleting an invoice outright (Delete, on its page and on its row in
 * Invoices). A draft is anybody's who may change drafts. Anything issued,
 * paid, void or fiscalised is the owner's alone, with a reason and its number
 * typed to confirm. One transaction takes, as if it had never been written:
 *
 * - the invoice and its lines;
 * - every journal it posted (its posting, each edit's, their reversals and its
 *   void), its credit notes and write-offs with theirs, their receivables
 *   sub-ledger lines and their posting events;
 * - its fiscal record. A receipt signed into a fiscal day that is still open
 *   is refused until the day closes: the day's Z report counts it.
 *
 * Payments are never deleted. Each is taken off the invoice and stays as the
 * customer's money on account: the receipt and its posting stay, and its
 * sub-ledger line keeps the customer. The CRM's copy of the invoice on the deal
 * goes (the deal and its quote stay, with a line on the timeline), and
 * commission not yet paid on it is voided. Vane's cards about it are closed.
 *
 * A `books.invoice.deleted` audit event keeps the whole of it as JSON, who did
 * it and why. Invoice numbers come from a counter, so the number is never
 * handed out again.
 */

type Db = Prisma.TransactionClient | PrismaClient;

/** The journals an invoice posted, and its notes' and write-offs'. Reversal mirrors are found from these. */
function postedWhere(companyId: string, invoiceId: string, noteIds: string[], writeOffIds: string[]): Prisma.JournalEntryWhereInput {
  const withVoids = (ids: string[]) => ids.flatMap((id) => [id, `void:${id}`]);
  return {
    companyId,
    OR: [
      { sourceType: "SALES_INVOICE", OR: [{ sourceId: invoiceId }, { sourceId: { startsWith: `${invoiceId}:` } }, { sourceId: `void:${invoiceId}` }] },
      ...(noteIds.length ? [{ sourceType: "SALES_CREDIT_NOTE" as const, sourceId: { in: withVoids(noteIds) } }] : []),
      ...(writeOffIds.length ? [{ sourceType: "SALES_WRITE_OFF" as const, sourceId: { in: withVoids(writeOffIds) } }] : []),
    ],
  };
}

async function gather(db: Db, companyId: string, invoiceId: string) {
  const invoice = await db.salesInvoice.findFirst({
    where: { id: invoiceId, companyId },
    include: {
      lines: true,
      customer: { select: { id: true, name: true } },
      // Its live payments, which go on account. A void one is only unlinked (below), as every receipt on it is.
      receipts: { where: { voidedAt: null }, select: { id: true, receiptNumber: true, amount: true, receivedAt: true, method: true } },
      creditNotes: { include: { lines: true, fiscalReceipt: { select: { id: true, status: true, receiptGlobalNo: true, fiscalDay: { select: { status: true, fiscalDayNo: true } } } } } },
      writeOffs: true,
      fiscalReceipt: { include: { fiscalDay: { select: { status: true, fiscalDayNo: true } } } },
      crmLeadDocuments: { select: { id: true, type: true, dealId: true, leadId: true, amount: true } },
    },
  });
  if (!invoice) return null;
  const noteIds = invoice.creditNotes.map((note) => note.id);
  const writeOffIds = invoice.writeOffs.map((writeOff) => writeOff.id);
  const posted = await db.journalEntry.findMany({ where: postedWhere(companyId, invoice.id, noteIds, writeOffIds), include: { lines: true } });
  const mirrors = posted.length
    ? await db.journalEntry.findMany({ where: { companyId, reversalOfEntryId: { in: posted.map((entry) => entry.id) } }, include: { lines: true } })
    : [];
  const sources = [
    { sourceType: "SALES_INVOICE" as const, sourceId: invoice.id },
    ...noteIds.map((id) => ({ sourceType: "SALES_CREDIT_NOTE" as const, sourceId: id })),
    ...writeOffIds.map((id) => ({ sourceType: "SALES_WRITE_OFF" as const, sourceId: id })),
  ];
  const ledger = await db.paymentLedgerEntry.findMany({ where: { companyId, OR: [...sources, { invoiceId: invoice.id, sourceType: { not: "SALES_RECEIPT" } }] } });
  const fiscal = [invoice.fiscalReceipt, ...invoice.creditNotes.map((note) => note.fiscalReceipt)].filter((row): row is NonNullable<typeof row> => Boolean(row));
  return { invoice, noteIds, writeOffIds, journals: [...posted, ...mirrors], mirrorIds: mirrors.map((entry) => entry.id), ledger, fiscal };
}

export async function readInvoiceRemoval(companyId: string, invoiceId: string, db: Db = prisma): Promise<InvoiceRemoval | null> {
  const found = await gather(db, companyId, invoiceId);
  if (!found) return null;
  const { invoice } = found;
  const period = await db.accountingPeriod.findFirst({
    where: { companyId, startDate: { lte: invoice.invoiceDate }, endDate: { gte: invoice.invoiceDate } },
    orderBy: { startDate: "asc" },
    select: { status: true },
  });
  return {
    number: invoice.invoiceNumber,
    draft: invoice.status === "DRAFT",
    ledgerEntries: found.journals.length,
    paymentLinks: invoice.receipts.length,
    creditNotes: invoice.creditNotes.length,
    fiscalRecord: found.fiscal.length > 0,
    fiscalDayOpen: found.fiscal.some((row) => row.fiscalDay !== null && row.fiscalDay.status !== "CLOSED"),
    periodClosed: invoice.status !== "DRAFT" && period?.status === "CLOSED",
    crm: invoice.crmLeadDocuments.length > 0,
  };
}

export type DeleteResult = { number: string; draft: boolean; onAccount: Array<{ id: string; number: string; amount: number }>; auditEventType: string };

/**
 * Deletes an invoice and everything it wrote to the books (see the header).
 * `confirm` is the number typed in the dialog, which a non-draft needs.
 */
export async function deleteInvoice(actor: InvoiceActor, invoiceId: string, input: { reason?: string | null; confirm?: string | null } = {}): Promise<DeleteResult> {
  const head = await prisma.salesInvoice.findFirst({ where: { id: invoiceId, companyId: actor.companyId }, select: { invoiceNumber: true, status: true } });
  if (!head) throw new InvoiceChangeRefused("That invoice is not here any more.", 404);
  const draft = head.status === "DRAFT";
  const reason = (input.reason ?? "").trim().slice(0, REASON_MAX);
  if (draft) {
    if (!isRouteAllowedForRole(actor.role, "/api/accounting/sales/invoices", "PATCH")) throw new InvoiceChangeRefused("Your role cannot change invoices.", 403);
  } else {
    if (!isWorkspaceOwner(actor.role)) throw new InvoiceChangeRefused(OWNER_ONLY, 403);
    if ((input.confirm ?? "").trim().toUpperCase() !== head.invoiceNumber.toUpperCase()) throw new InvoiceChangeRefused(`Type ${head.invoiceNumber} to delete it.`, 400);
    if (reason.length < REASON_MIN) throw new InvoiceChangeRefused("Say why, in a few words. The reason is kept in the audit log.", 400);
  }

  const now = new Date();
  return prisma.$transaction(
    async (tx) => {
      const found = await gather(tx, actor.companyId, invoiceId);
      if (!found) throw new InvoiceChangeRefused("That invoice is not here any more.", 404);
      const { invoice, noteIds, writeOffIds, journals, mirrorIds, ledger, fiscal } = found;
      if (invoice.status !== head.status) throw new InvoiceChangeRefused(`${invoice.invoiceNumber} changed while you were deleting it. Look again, then delete it.`);
      const openDay = fiscal.find((row) => row.fiscalDay !== null && row.fiscalDay.status !== "CLOSED");
      if (openDay) {
        throw new InvoiceChangeRefused(
          `${invoice.invoiceNumber} is on fiscal day ${openDay.fiscalDay!.fiscalDayNo}, which is still open, and the day's Z report counts it. Close the fiscal day, then delete it.`,
        );
      }

      const onAccount = invoice.receipts.map((receipt) => ({ id: receipt.id, number: receipt.receiptNumber, amount: Math.round(receipt.amount * 100) / 100 }));
      const integrationSources = [
        { sourceType: "SALES_INVOICE" as const, OR: [{ sourceId: invoice.id }, { sourceId: { startsWith: `${invoice.id}:` } }, { sourceId: `void:${invoice.id}` }] },
        ...(noteIds.length ? [{ sourceType: "SALES_CREDIT_NOTE" as const, sourceId: { in: noteIds.flatMap((id) => [id, `void:${id}`]) } }] : []),
        ...(writeOffIds.length ? [{ sourceType: "SALES_WRITE_OFF" as const, sourceId: { in: writeOffIds.flatMap((id) => [id, `void:${id}`]) } }] : []),
      ];
      const integrationEvents = await tx.accountingIntegrationEvent.findMany({ where: { companyId: actor.companyId, OR: integrationSources }, select: { id: true } });
      const vaneItems = await tx.vaneItem.findMany({ where: { companyId: actor.companyId, subjectType: "SalesInvoice", subjectId: invoice.id }, select: { id: true, status: true, headline: true } });
      const crmInvoiceDocs = invoice.crmLeadDocuments.filter((doc) => doc.type === "INVOICE");

      // The snapshot first, so the audit row holds what is about to go.
      await writePlatformAuditEvent(
        {
          companyId: actor.companyId,
          actorId: actor.userId,
          eventType: "books.invoice.deleted",
          entityType: "SalesInvoice",
          entityId: invoice.id,
          reason: reason || undefined,
          payload: {
            number: invoice.invoiceNumber,
            by: { userId: actor.userId, role: actor.role ?? null },
            invoice: { ...invoice, lines: undefined, receipts: undefined, creditNotes: undefined, writeOffs: undefined, fiscalReceipt: undefined, crmLeadDocuments: undefined },
            lines: invoice.lines,
            creditNotes: invoice.creditNotes,
            writeOffs: invoice.writeOffs,
            journalEntries: journals,
            paymentLedgerEntries: ledger,
            fiscalRecords: fiscal,
            // Whose money each payment is now: the Payments list reads it here when no sub-ledger line names the customer.
            receiptsOnAccount: onAccount.map((receipt) => ({ ...receipt, customerId: invoice.customerId })),
            crmDocuments: invoice.crmLeadDocuments,
            vaneItemsClosed: vaneItems.filter((item) => item.status === "OPEN").map((item) => item.id),
          },
        },
        tx,
      );

      // The books: reversal mirrors before what they mirror, then the rest.
      if (mirrorIds.length) await tx.journalEntry.deleteMany({ where: { id: { in: mirrorIds } } });
      const postedIds = journals.map((entry) => entry.id).filter((id) => !mirrorIds.includes(id));
      if (postedIds.length) await tx.journalEntry.deleteMany({ where: { id: { in: postedIds } } });
      if (ledger.length) await tx.paymentLedgerEntry.deleteMany({ where: { id: { in: ledger.map((row) => row.id) } } });
      if (integrationEvents.length) await tx.accountingIntegrationEvent.deleteMany({ where: { id: { in: integrationEvents.map((row) => row.id) } } });
      if (fiscal.length) await tx.fiscalReceipt.deleteMany({ where: { id: { in: fiscal.map((row) => row.id) } } });

      // Payments stay, as the customer's money on account; a void one stays void, on no invoice.
      await tx.salesReceipt.updateMany({ where: { companyId: actor.companyId, invoiceId: invoice.id }, data: { invoiceId: null } });
      if (onAccount.length) {
        await tx.paymentLedgerEntry.updateMany({
          where: { companyId: actor.companyId, sourceType: "SALES_RECEIPT", sourceId: { in: onAccount.map((row) => row.id) } },
          data: { invoiceId: null, partyId: invoice.customerId },
        });
      }

      // The CRM: its copy of the invoice goes from the deal, which says so; unpaid commission on it is voided.
      for (const doc of crmInvoiceDocs) {
        await tx.crmCommissionEntry.updateMany({ where: { companyId: actor.companyId, leadDocumentId: doc.id, status: { in: ["PENDING", "APPROVED"] } }, data: { status: "VOIDED" } });
        if (doc.dealId || doc.leadId) {
          await tx.crmActivity.create({
            data: {
              companyId: actor.companyId,
              type: "SYSTEM",
              leadId: doc.leadId ?? undefined,
              dealId: doc.dealId ?? undefined,
              subject: `Invoice ${invoice.invoiceNumber} deleted in Books`,
              metadata: { kind: "DOCUMENT_DELETED", invoiceId: invoice.id, origin: "BOOKS", reason: reason || null },
              createdById: actor.userId,
              occurredAt: now,
            },
          });
        }
      }
      await tx.crmLeadDocument.deleteMany({ where: { companyId: actor.companyId, invoiceId: invoice.id } });

      // Vane: its cards about the invoice are done, and what they proposed for it will not run.
      const openItems = vaneItems.filter((item) => item.status === "OPEN").map((item) => item.id);
      if (openItems.length) await tx.vaneItem.updateMany({ where: { id: { in: openItems } }, data: { status: "DONE", resolvedAt: now, resolvedById: actor.userId } });
      await tx.vaneAction.updateMany({
        where: {
          companyId: actor.companyId,
          status: "PROPOSED",
          OR: [...(vaneItems.length ? [{ itemId: { in: vaneItems.map((item) => item.id) } }] : []), { params: { path: ["invoiceId"], equals: invoice.id } }],
        },
        data: { status: "DENIED", result: `${invoice.invoiceNumber} was deleted.`, decidedById: actor.userId, decidedAt: now },
      });

      // Lines, credit notes and write-offs go with it (cascade).
      await tx.salesInvoice.delete({ where: { id: invoice.id } });
      return { number: invoice.invoiceNumber, draft, onAccount, auditEventType: "books.invoice.deleted" };
    },
    { timeout: 30_000 },
  );
}
