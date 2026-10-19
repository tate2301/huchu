import type { Prisma, PrismaClient } from "@prisma/client";
import { docLabel } from "@/lib/books/doc-number";

import { recalcSalesInvoiceBalance } from "@/lib/accounting/balances";
import { createJournalEntryFromSource } from "@/lib/accounting/posting";
import { writePlatformAuditEvent } from "@/lib/audit/platform";
import { prisma } from "@/lib/prisma";

import { dayOf, shortDay, storedDay } from "./format";
import { canDo } from "./core/can-do";
import { markVoided } from "./core/void-money";
import { InvoiceChangeRefused, RECEIPT_OWNER_ONLY, type InvoiceActor } from "./owner";
import { onAccountCustomers } from "./payments";
import { REASON_MAX, REASON_MIN, wasFiscalised } from "./reversal";

/**
 * Voiding a payment (a receipt Receivables or Bank recorded) from Books →
 * Payments, by the workspace's owner only, with a reason that is kept:
 *
 * - **The posting.** The receipt's rule is posted again with every direction
 *   inverted, under `void:<receiptId>`, dated today, as an invoice's void is
 *   (`reverse-invoice.ts`): the bank down, what the customer owes back up. Its
 *   receivables sub-ledger line becomes VOIDED, so aged debt and the
 *   customer's balance leave it out.
 * - **The invoice it paid.** Its balance is worked out again without it: a
 *   PAID invoice is ISSUED again, owed what the payment paid.
 * - **The bank.** A payment Books → Bank recorded from a statement line has a
 *   bank transaction standing for it, which posted nothing. That goes, and the
 *   statement line is open again, to match to something else.
 * - **The CRM.** Its copy of the receipt goes from the deal or lead (which
 *   says so on its timeline), and unpaid commission on it is voided.
 * - **Fiscal.** A receipt is never fiscalised itself: the invoice is. Nothing
 *   is sent to the fiscal device (`fiscalisation.ts` has no void to send), so
 *   the drawer says the device still holds the invoice. While the invoice sits
 *   in a fiscal day that is still open, the void is refused (409), the same
 *   rule as Delete on an invoice.
 *
 * The receipt stays, in Payments marked Void with who, when and why, and stops
 * counting as money in. A `books.receipt.voided` audit event keeps a snapshot
 * of it and of everything changed. Its number is never handed out again: the
 * row keeps it.
 */

type Db = Prisma.TransactionClient | PrismaClient;

const round = (n: number) => Math.round(n * 100) / 100;

function reasonOf(reason: string | null | undefined): string {
  const text = (reason ?? "").trim();
  if (text.length < REASON_MIN) throw new InvoiceChangeRefused("Say why, in a few words. The reason is kept with the payment.", 400);
  return text.slice(0, REASON_MAX);
}

async function gather(db: Db, companyId: string, receiptId: string) {
  const receipt = await db.salesReceipt.findFirst({
    where: { id: receiptId, companyId },
    include: {
      invoice: {
        select: {
          id: true,
          invoiceNumber: true,
          status: true,
          currency: true,
          total: true,
          amountPaid: true,
          creditTotal: true,
          writeOffTotal: true,
          customerId: true,
          customer: { select: { id: true, name: true } },
          fiscalReceipt: { select: { status: true, receiptGlobalNo: true, fiscalDay: { select: { status: true, fiscalDayNo: true } } } },
        },
      },
      bankAccount: { select: { name: true, bankName: true } },
      crmLeadDocuments: { select: { id: true, type: true, dealId: true, leadId: true, amount: true } },
    },
  });
  if (!receipt) return null;
  const [journals, ledger, bank] = await Promise.all([
    db.journalEntry.findMany({ where: { companyId, sourceType: "SALES_RECEIPT", sourceId: { in: [receipt.id, `void:${receipt.id}`] } }, include: { lines: true } }),
    db.paymentLedgerEntry.findFirst({ where: { companyId, sourceType: "SALES_RECEIPT", sourceId: receipt.id } }),
    db.bankTransaction.findMany({
      where: { companyId, sourceType: "SALES_RECEIPT", sourceId: receipt.id },
      include: { matchedStatementLines: true, bankAccount: { select: { name: true, bankName: true } } },
    }),
  ]);
  // Whose money it is when it is on no invoice: its sub-ledger line names the customer, or the void or
  // deletion of the invoice it was on does (`reverse-invoice.ts`, `delete-invoice.ts`), as Payments reads it.
  const customerId = receipt.invoice?.customerId ?? ledger?.partyId ?? null;
  let customer: { id: string | null; name: string } | null =
    receipt.invoice?.customer ?? (customerId ? await db.customer.findFirst({ where: { id: customerId, companyId }, select: { id: true, name: true } }) : null);
  if (!customer) {
    const name = (await onAccountCustomers(db, companyId, [{ id: receipt.id, invoice: null }])).get(receipt.id);
    customer = name ? { id: null, name } : null;
  }
  return { receipt, journals, ledger, bank, customer };
}

type Gathered = NonNullable<Awaited<ReturnType<typeof gather>>>;

/** What Void does to one payment, for its drawer: read before anything is done. */
export type ReceiptVoidFacts = {
  id: string;
  number: string;
  amount: number;
  currency: string;
  received: string;
  method: string;
  customer: string | null;
  /** The invoice it paid, and what is owed on it once the payment is void. */
  invoice: { id: string; number: string; paid: boolean; owedAfter: number } | null;
  /** The statement line it was matched to in Books → Bank, which opens again. */
  bankLine: { bank: string; day: string; description: string } | null;
  /** It posted a journal, which the void reverses; a receipt that never posted changes nothing in the ledger. */
  posted: boolean;
  /** The invoice it paid reached the fiscal device, which keeps it whatever is voided here. */
  fiscalised: boolean;
  /** That invoice sits in a fiscal day still open: the void waits until the day closes. */
  fiscalDayOpen: number | null;
  /** Whether it is void already, and who, when and why. */
  voided: { by: string | null; on: string; reason: string | null } | null;
};

function factsOf(found: Gathered, voider: string | null): ReceiptVoidFacts {
  const { receipt, bank, customer } = found;
  const invoice = receipt.invoice;
  const day = invoice?.fiscalReceipt?.fiscalDay;
  const line = bank.flatMap((txn) => txn.matchedStatementLines.map((statement) => ({ statement, txn })))[0] ?? null;
  const owedNow = invoice ? Math.max(0, round(invoice.total - invoice.amountPaid - invoice.creditTotal - invoice.writeOffTotal)) : 0;
  return {
    id: receipt.id,
    number: receipt.receiptNumber,
    amount: round(receipt.amount),
    currency: invoice?.currency ?? "USD",
    received: shortDay(storedDay(receipt.receivedAt)),
    method: receipt.method,
    customer: customer?.name ?? null,
    invoice: invoice
      ? {
          id: invoice.id,
          number: docLabel(invoice.invoiceNumber),
          paid: invoice.status === "PAID",
          owedAfter: invoice.status === "VOIDED" ? 0 : Math.min(round(invoice.total - invoice.creditTotal - invoice.writeOffTotal), round(owedNow + receipt.amount)),
        }
      : null,
    bankLine: line
      ? {
          bank: line.txn.bankAccount.bankName || line.txn.bankAccount.name,
          day: shortDay(storedDay(line.statement.txnDate)),
          description: line.statement.description,
        }
      : null,
    posted: found.journals.some((entry) => entry.sourceId === receipt.id && entry.status === "POSTED" && entry.reversedAt === null),
    fiscalised: wasFiscalised(invoice?.fiscalReceipt ?? null),
    fiscalDayOpen: day && day.status !== "CLOSED" ? day.fiscalDayNo : null,
    voided: receipt.voidedAt ? { by: voider, on: shortDay(dayOf(receipt.voidedAt)), reason: receipt.voidReason } : null,
  };
}

/** The drawer's facts for one payment, or null when it is not in this workspace. */
export async function readReceiptVoid(companyId: string, receiptId: string, db: Db = prisma): Promise<ReceiptVoidFacts | null> {
  const found = await gather(db, companyId, receiptId);
  if (!found) return null;
  const voider = found.receipt.voidedById ? await db.user.findFirst({ where: { id: found.receipt.voidedById }, select: { name: true } }) : null;
  return factsOf(found, voider?.name ?? null);
}

export type ReceiptVoidResult = {
  number: string;
  amount: number;
  currency: string;
  customer: string | null;
  /** The invoice it paid, as it stands now: owed again, ISSUED once more if it was PAID. */
  invoice: { number: string; status: string; owed: number } | null;
  /** The statement line opened again in Books → Bank. */
  bankLine: { bank: string; day: string; description: string } | null;
  fiscalised: boolean;
  reversalEntryId: string | null;
};

/**
 * Voids a payment (see the header). The reversal posts first, so a locked
 * period refuses the void with nothing changed; posting again finds it under
 * `void:<id>` and goes on. Everything else changes in one transaction.
 */
export async function voidReceipt(actor: InvoiceActor, receiptId: string, input: { reason: string; source?: string }): Promise<ReceiptVoidResult> {
  if (!canDo(actor, "void", { kind: "receipt" }).allowed) throw new InvoiceChangeRefused(RECEIPT_OWNER_ONLY, 403);
  const reason = reasonOf(input.reason);
  const found = await gather(prisma, actor.companyId, receiptId);
  if (!found) throw new InvoiceChangeRefused("That payment is not here any more.", 404);
  const facts = factsOf(found, null);
  const { receipt } = found;
  if (receipt.voidedAt) throw new InvoiceChangeRefused(`${receipt.receiptNumber} is void already.`);
  if (facts.fiscalDayOpen !== null) {
    throw new InvoiceChangeRefused(
      `${receipt.receiptNumber} paid ${facts.invoice!.number}, which is on fiscal day ${facts.fiscalDayOpen}, still open, and the day's Z report counts it. Close the fiscal day, then void it.`,
    );
  }

  const now = new Date();
  let reversalEntryId: string | null = null;
  const posted = found.journals.find((entry) => entry.sourceId === receipt.id && entry.status === "POSTED" && entry.reversedAt === null);
  if (posted) {
    const result = await createJournalEntryFromSource({
      companyId: actor.companyId,
      sourceType: "SALES_RECEIPT",
      sourceId: `void:${receipt.id}`,
      entryDate: now,
      description: `Void sales receipt ${receipt.receiptNumber}`,
      createdById: actor.userId,
      actorRole: actor.role ?? undefined,
      periodOverrideReason: reason,
      amount: receipt.amount,
      netAmount: receipt.amount,
      taxAmount: 0,
      grossAmount: receipt.amount,
      currency: facts.currency,
      invertDirection: true,
    });
    if (!result.entryId) throw new InvoiceChangeRefused(`${receipt.receiptNumber} was not voided: its reversal could not be posted (${result.error ?? "no journal was written"}).`);
    reversalEntryId = result.entryId;
    await markVoided(posted.id, result.entryId, actor.userId);
  }

  return prisma.$transaction(
    async (tx) => {
      // Looked at again inside the transaction: someone else may have voided it meanwhile.
      const still = await tx.salesReceipt.findFirst({ where: { id: receipt.id, companyId: actor.companyId }, select: { voidedAt: true } });
      if (!still) throw new InvoiceChangeRefused("That payment is not here any more.", 404);
      if (still.voidedAt) throw new InvoiceChangeRefused(`${receipt.receiptNumber} is void already.`);

      const statementLines = found.bank.flatMap((txn) => txn.matchedStatementLines);
      const crmReceiptDocs = receipt.crmLeadDocuments.filter((doc) => doc.type === "RECEIPT");

      // The snapshot first, so the audit row holds what is about to change.
      await writePlatformAuditEvent(
        {
          companyId: actor.companyId,
          actorId: actor.userId,
          eventType: "books.receipt.voided",
          entityType: "SalesReceipt",
          entityId: receipt.id,
          reason,
          payload: {
            number: receipt.receiptNumber,
            by: { userId: actor.userId, role: actor.role ?? null },
            receipt: { ...receipt, invoice: undefined, bankAccount: undefined, crmLeadDocuments: undefined },
            amount: round(receipt.amount),
            currency: facts.currency,
            customerId: found.customer?.id ?? null,
            invoice: receipt.invoice ? { id: receipt.invoice.id, number: receipt.invoice.invoiceNumber, status: receipt.invoice.status, amountPaid: receipt.invoice.amountPaid } : null,
            journalEntries: found.journals,
            reversalEntryId,
            paymentLedgerEntry: found.ledger,
            bankTransactions: found.bank.map((txn) => ({ ...txn, bankAccount: undefined, matchedStatementLines: undefined })),
            statementLinesReopened: statementLines.map((line) => ({ id: line.id, txnDate: line.txnDate, description: line.description, amount: line.amount })),
            crmDocuments: crmReceiptDocs,
            fiscalised: facts.fiscalised,
            source: input.source ?? "books",
          },
        },
        tx,
      );

      await tx.salesReceipt.update({ where: { id: receipt.id }, data: { voidedAt: now, voidedById: actor.userId, voidReason: reason } });
      // Aged debt and the customer's balance read the sub-ledger's POSTED lines.
      await tx.paymentLedgerEntry.updateMany({ where: { companyId: actor.companyId, sourceType: "SALES_RECEIPT", sourceId: receipt.id }, data: { status: "VOIDED" } });

      // The bank: the line is open again, and the transaction that stood for the payment (which posted nothing) goes.
      if (statementLines.length) await tx.bankStatementLine.updateMany({ where: { id: { in: statementLines.map((line) => line.id) } }, data: { matchedTransactionId: null } });
      if (found.bank.length) await tx.bankTransaction.deleteMany({ where: { id: { in: found.bank.map((txn) => txn.id) } } });

      // The CRM: its copy of the receipt goes from the deal, which says so; unpaid commission on it is voided.
      for (const doc of crmReceiptDocs) {
        await tx.crmCommissionEntry.updateMany({ where: { companyId: actor.companyId, leadDocumentId: doc.id, status: { in: ["PENDING", "APPROVED"] } }, data: { status: "VOIDED" } });
        if (doc.dealId || doc.leadId) {
          await tx.crmActivity.create({
            data: {
              companyId: actor.companyId,
              type: "SYSTEM",
              leadId: doc.leadId ?? undefined,
              dealId: doc.dealId ?? undefined,
              subject: `Payment ${receipt.receiptNumber} voided in Books`,
              metadata: { kind: "DOCUMENT_VOIDED", receiptId: receipt.id, origin: "BOOKS", reason },
              createdById: actor.userId,
              occurredAt: now,
            },
          });
        }
      }
      if (crmReceiptDocs.length) await tx.crmLeadDocument.deleteMany({ where: { id: { in: crmReceiptDocs.map((doc) => doc.id) } } });

      // The invoice it paid is owed it again; PAID becomes ISSUED.
      const balance = receipt.invoiceId ? await recalcSalesInvoiceBalance(receipt.invoiceId, tx) : null;

      return {
        number: receipt.receiptNumber,
        amount: round(receipt.amount),
        currency: facts.currency,
        customer: facts.customer,
        invoice: receipt.invoice && balance ? { number: docLabel(receipt.invoice.invoiceNumber), status: balance.status, owed: receipt.invoice.status === "VOIDED" ? 0 : round(balance.balance) } : null,
        bankLine: facts.bankLine,
        fiscalised: facts.fiscalised,
        reversalEntryId,
      };
    },
    { timeout: 30_000 },
  );
}

