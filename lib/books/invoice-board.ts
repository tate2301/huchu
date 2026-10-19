import type { PrismaClient } from "@prisma/client";

import { asOf, dayOf, methodWord, shortDay, storedDay } from "./format";
import type { InvoiceBoardExtras } from "./invoice-board-view";

/**
 * What BkInvoice draws beyond the invoice itself: the payments on it with the
 * bank line each matched, the ledger entries it and they posted, the fiscal
 * block, and its history, told from the records (no separate log is kept).
 */

type Db = PrismaClient;

const round = (n: number) => Math.round(n * 100) / 100;

export async function readInvoiceExtras(db: Db, companyId: string, invoiceId: string, now = new Date()): Promise<InvoiceBoardExtras | null> {
  const invoice = await db.salesInvoice.findFirst({
    where: { id: invoiceId, companyId },
    select: {
      id: true,
      invoiceNumber: true,
      invoiceDate: true,
      dueDate: true,
      createdAt: true,
      issuedAt: true,
      madeByVane: true,
      createdBy: { select: { name: true } },
      issuedBy: { select: { name: true } },
      fromQuotation: { select: { quotationNumber: true } },
      fiscalReceipt: { select: { status: true, fiscalNumber: true, receiptNumber: true, issuedAt: true, qrCodeData: true, lastError: true } },
      receipts: {
        orderBy: { receivedAt: "asc" },
        select: {
          id: true,
          receiptNumber: true,
          receivedAt: true,
          amount: true,
          method: true,
          voidedAt: true,
          createdAt: true,
          bankAccount: { select: { name: true, bankName: true, currency: true } },
          createdBy: { select: { name: true } },
        },
      },
      creditNotes: { orderBy: { noteDate: "asc" }, select: { id: true, noteNumber: true, total: true, issuedAt: true, createdAt: true, status: true } },
      writeOffs: { select: { id: true, writeOffNumber: true, amount: true, createdAt: true, status: true } },
    },
  });
  if (!invoice) return null;
  const receiptIds = invoice.receipts.map((receipt) => receipt.id);
  const [entries, matched] = await Promise.all([
    db.journalEntry.findMany({
      where: {
        companyId,
        OR: [
          { sourceType: "SALES_INVOICE", sourceId: { startsWith: invoice.id } },
          { sourceType: "SALES_RECEIPT", sourceId: { in: receiptIds } },
          { sourceId: `void:${invoice.id}` },
        ],
      },
      orderBy: [{ entryDate: "asc" }, { entryNumber: "asc" }],
      select: { entryNumber: true, entryDate: true, lines: { select: { debit: true, credit: true, account: { select: { code: true, name: true } } } } },
    }),
    receiptIds.length
      ? db.bankTransaction.findMany({
          where: { companyId, sourceType: "SALES_RECEIPT", sourceId: { in: receiptIds } },
          select: { sourceId: true, matchedStatementLines: { select: { id: true }, take: 1 } },
        })
      : Promise.resolve([]),
  ]);
  const matchedIds = new Set(matched.filter((row) => row.matchedStatementLines.length > 0).map((row) => row.sourceId));
  const hasBankTxn = new Set(matched.map((row) => row.sourceId));

  const history: Array<InvoiceBoardExtras["history"][number] & { sort: number }> = [];
  const at = (value: Date) => asOf(value, now).replace(/^Today /, `${shortDay(dayOf(value))} `).replace(/^Yesterday /, `${shortDay(dayOf(value))} `);
  history.push({ tone: "", text: `${invoice.madeByVane && !invoice.createdBy ? "Vane" : (invoice.createdBy?.name ?? "Someone")} drafted it${invoice.fromQuotation ? ` from ${invoice.fromQuotation.quotationNumber}` : ""}`, when: at(invoice.createdAt), sort: invoice.createdAt.getTime() });
  if (invoice.issuedAt) history.push({ tone: "in", text: `${invoice.issuedBy?.name ?? "Someone"} issued it`, when: at(invoice.issuedAt), sort: invoice.issuedAt.getTime() + 1 });
  if (invoice.fiscalReceipt?.status === "SUCCESS" && invoice.fiscalReceipt.issuedAt) {
    history.push({ tone: "ok", text: "Signed by FDMS", when: at(invoice.fiscalReceipt.issuedAt), sort: invoice.fiscalReceipt.issuedAt.getTime() + 2 });
  }
  for (const receipt of invoice.receipts) {
    history.push({ tone: "ok", text: `${receipt.createdBy?.name ?? "Someone"} recorded ${receipt.receiptNumber}`, when: at(receipt.createdAt), sort: receipt.createdAt.getTime() });
    if (receipt.voidedAt) history.push({ tone: "wa", text: `${receipt.receiptNumber} was voided`, when: at(receipt.voidedAt), sort: receipt.voidedAt.getTime() });
  }
  for (const note of invoice.creditNotes) {
    if (note.status === "DRAFT") continue;
    const when = note.issuedAt ?? note.createdAt;
    history.push({ tone: "wa", text: `${note.noteNumber ?? "A credit note"} credited it`, when: at(when), sort: when.getTime() });
  }
  for (const writeOff of invoice.writeOffs) {
    history.push({ tone: "wa", text: `${writeOff.writeOffNumber ?? "A write-off"} wrote off what was left`, when: at(writeOff.createdAt), sort: writeOff.createdAt.getTime() });
  }
  history.sort((a, b) => b.sort - a.sort);

  const fiscal = invoice.fiscalReceipt;
  return {
    payments: invoice.receipts.map((receipt) => ({
      id: receipt.id,
      number: receipt.receiptNumber,
      date: shortDay(storedDay(receipt.receivedAt)),
      how: receipt.bankAccount
        ? `${methodWord(receipt.method).replace(/^./, (c) => c.toUpperCase())} into ${receipt.bankAccount.bankName || receipt.bankAccount.name}, ${receipt.bankAccount.currency}`
        : methodWord(receipt.method).replace(/^./, (c) => c.toUpperCase()),
      bankLine: receipt.voidedAt ? "Void" : matchedIds.has(receipt.id) ? "Matched" : hasBankTxn.has(receipt.id) ? "To match" : "No bank line",
      amount: round(receipt.amount),
      voided: receipt.voidedAt !== null,
    })),
    posting: entries.flatMap((entry) =>
      entry.lines
        .filter((line) => line.debit > 0.004 || line.credit > 0.004)
        .sort((a, b) => b.debit - a.debit)
        .map((line, index) => ({
          entry: index === 0 ? `JE-${String(entry.entryNumber).padStart(4, "0")}` : "",
          date: index === 0 ? shortDay(storedDay(entry.entryDate)) : "",
          account: `${line.account.code} ${line.account.name}`,
          debit: line.debit > 0.004 ? round(line.debit) : null,
          credit: line.credit > 0.004 ? round(line.credit) : null,
        })),
    ),
    entries: entries.length,
    history: history.map(({ tone, text, when }) => ({ tone, text, when })),
    fiscal: fiscal
      ? {
          status: fiscal.status === "SUCCESS" ? "Valid" : fiscal.status === "FAILED" ? "Failed" : fiscal.status === "VOIDED" ? "Void" : "Pending",
          code: fiscal.fiscalNumber ?? fiscal.receiptNumber ?? null,
          signed: fiscal.issuedAt ? at(fiscal.issuedAt) : null,
          qr: fiscal.qrCodeData ?? null,
          error: fiscal.lastError ?? null,
        }
      : null,
    issued: invoice.issuedAt ? `${shortDay(dayOf(invoice.issuedAt))}${invoice.fromQuotation ? `, from ${invoice.fromQuotation.quotationNumber}` : ""}` : null,
  };
}
