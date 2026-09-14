/**
 * Which fee documents the ledger does not know about, and why.
 *
 * Every school fee posting is emitted after the money transaction has
 * committed. That ordering is deliberate and is not changed here: posting
 * inside the transaction would hold row locks on the family's invoices across
 * a rule resolution, a period lookup and an entry write, and a posting engine
 * failure would then roll back money the bursar has already taken at the
 * counter. What was missing is the other half of that bargain — a record of
 * whether the posting actually landed. Until now a failure reached a
 * `console.error` and a field in the response body, so a school could take
 * $450, hand over a receipt, and have neither a journal entry nor any query
 * that would find the receipt again.
 *
 * The pattern is fiscalisation's, not a second one invented for accounting:
 * `issueFiscalDocument` writes a PENDING `FiscalReceipt` row before it dials
 * FDMS, so a crash leaves something for replay to drain. Here the route sets
 * `accountingStatus` to PENDING inside the transaction that moves the money,
 * and calls `recordSchoolFeePosting` with the engine's answer afterwards. The
 * PENDING row is the durable part; this module's write only refines it.
 *
 * Two operations, because two are what exist to be used: record an outcome,
 * and list what has none. A replay endpoint is the obvious next caller of the
 * second and is deliberately not built ahead of it.
 */
import type { Prisma, SchoolFeePostingStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** The four fee documents that post. Nothing else in the module reaches the ledger. */
export type SchoolFeeDocumentKind = "INVOICE" | "RECEIPT" | "WAIVER" | "REFUND";

/**
 * What the posting engine answered, structurally identical to
 * `SchoolFeePostingResult` in `app/api/v2/schools/fees/_helpers.ts`.
 *
 * Declared here rather than imported because `lib/` is what `app/` builds on
 * and not the other way round. A call site passes the result straight through.
 */
export type SchoolFeePostingOutcome = {
  accountingStatus: "POSTED" | "PENDING" | "FAILED";
  journalEntryId: string | null;
  accountingError: string | null;
};

export type UnpostedSchoolFeeDocument = {
  document: SchoolFeeDocumentKind;
  id: string;
  /** The number a bursar would search for. A waiver has none, so its id stands in. */
  reference: string;
  studentId: string;
  currency: string;
  /** The base-currency figure, which is what the ledger entry would have carried. */
  baseAmount: Prisma.Decimal;
  accountingStatus: "PENDING" | "FAILED";
  accountingError: string | null;
  /** When the money moved, so the list can lead with the oldest hole. */
  occurredAt: Date;
};

/** The two states that mean the ledger is out of step with the document. */
const UNPOSTED_STATUSES: SchoolFeePostingStatus[] = ["PENDING", "FAILED"];

/**
 * Narrow the column to what the query above already guarantees, without a cast.
 * PENDING is the fallback rather than FAILED because it is the safer of the two
 * to be wrong about: it says "look at this", where FAILED asserts a failure
 * that may not have happened.
 */
function unpostedStatus(status: SchoolFeePostingStatus): "PENDING" | "FAILED" {
  return status === "FAILED" ? "FAILED" : "PENDING";
}

/**
 * Record what the ledger said about one fee document.
 *
 * It never throws. The caller has already committed the money and returned
 * nothing to the bursar yet; failing the request here would report a receipt as
 * failed when the school is holding the cash and the invoices are settled. A
 * write that does not happen leaves the row at the PENDING its own transaction
 * set, which is exactly where `listUnpostedSchoolFeeDocuments` looks, so the
 * document is not lost — it stays on the list until somebody replays it.
 */
export async function recordSchoolFeePosting(input: {
  companyId: string;
  document: SchoolFeeDocumentKind;
  documentId: string;
  outcome: SchoolFeePostingOutcome;
}): Promise<void> {
  const { companyId, documentId, outcome } = input;
  const where = { id: documentId, companyId };
  const data = {
    accountingStatus: outcome.accountingStatus,
    journalEntryId: outcome.journalEntryId,
    accountingPostedAt: outcome.accountingStatus === "POSTED" ? new Date() : null,
    accountingError: outcome.accountingError,
  };

  try {
    switch (input.document) {
      case "INVOICE":
        await prisma.schoolFeeInvoice.updateMany({ where, data });
        return;
      case "RECEIPT":
        await prisma.schoolFeeReceipt.updateMany({ where, data });
        return;
      case "WAIVER":
        await prisma.schoolFeeWaiver.updateMany({ where, data });
        return;
      case "REFUND":
        await prisma.schoolFeeRefund.updateMany({ where, data });
        return;
    }
  } catch (error) {
    console.error(
      `[Accounting] Could not record the posting outcome for ${input.document} ${documentId}:`,
      error,
    );
  }
}

/**
 * Every fee document whose posting is missing or failed, oldest first.
 *
 * Oldest first because the cost of an unposted document grows with age: a
 * receipt taken this morning is a retry, one taken in March is a restated
 * trial balance. `limit` applies per document kind before the merge, so a
 * thousand unposted invoices cannot push a single unposted refund off the end.
 */
export async function listUnpostedSchoolFeeDocuments(input: {
  companyId: string;
  limit?: number;
}): Promise<UnpostedSchoolFeeDocument[]> {
  const { companyId } = input;
  const take = input.limit ?? 100;

  const [invoices, receipts, waivers, refunds] = await Promise.all([
    prisma.schoolFeeInvoice.findMany({
      where: { companyId, accountingStatus: { in: UNPOSTED_STATUSES } },
      select: {
        id: true,
        invoiceNo: true,
        studentId: true,
        currency: true,
        baseAmount: true,
        accountingStatus: true,
        accountingError: true,
        issueDate: true,
      },
      orderBy: { issueDate: "asc" },
      take,
    }),
    prisma.schoolFeeReceipt.findMany({
      where: { companyId, accountingStatus: { in: UNPOSTED_STATUSES } },
      select: {
        id: true,
        receiptNo: true,
        studentId: true,
        currency: true,
        baseAmount: true,
        accountingStatus: true,
        accountingError: true,
        receiptDate: true,
      },
      orderBy: { receiptDate: "asc" },
      take,
    }),
    prisma.schoolFeeWaiver.findMany({
      where: { companyId, accountingStatus: { in: UNPOSTED_STATUSES } },
      select: {
        id: true,
        studentId: true,
        currency: true,
        baseAmount: true,
        accountingStatus: true,
        accountingError: true,
        appliedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
      take,
    }),
    prisma.schoolFeeRefund.findMany({
      where: { companyId, accountingStatus: { in: UNPOSTED_STATUSES } },
      select: {
        id: true,
        refundNo: true,
        studentId: true,
        currency: true,
        baseAmount: true,
        accountingStatus: true,
        accountingError: true,
        refundDate: true,
      },
      orderBy: { refundDate: "asc" },
      take,
    }),
  ]);

  const rows: UnpostedSchoolFeeDocument[] = [
    ...invoices.map((row) => ({
      document: "INVOICE" as const,
      id: row.id,
      reference: row.invoiceNo,
      studentId: row.studentId,
      currency: row.currency,
      baseAmount: row.baseAmount,
      accountingStatus: unpostedStatus(row.accountingStatus),
      accountingError: row.accountingError,
      occurredAt: row.issueDate,
    })),
    ...receipts.map((row) => ({
      document: "RECEIPT" as const,
      id: row.id,
      reference: row.receiptNo,
      studentId: row.studentId,
      currency: row.currency,
      baseAmount: row.baseAmount,
      accountingStatus: unpostedStatus(row.accountingStatus),
      accountingError: row.accountingError,
      occurredAt: row.receiptDate,
    })),
    ...waivers.map((row) => ({
      document: "WAIVER" as const,
      id: row.id,
      reference: row.id,
      studentId: row.studentId,
      currency: row.currency,
      baseAmount: row.baseAmount,
      accountingStatus: unpostedStatus(row.accountingStatus),
      accountingError: row.accountingError,
      occurredAt: row.appliedAt ?? row.createdAt,
    })),
    ...refunds.map((row) => ({
      document: "REFUND" as const,
      id: row.id,
      reference: row.refundNo,
      studentId: row.studentId,
      currency: row.currency,
      baseAmount: row.baseAmount,
      accountingStatus: unpostedStatus(row.accountingStatus),
      accountingError: row.accountingError,
      occurredAt: row.refundDate,
    })),
  ];

  return rows.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
}
