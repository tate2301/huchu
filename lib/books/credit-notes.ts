import type { Prisma, PrismaClient } from "@prisma/client";

import { count, dayOf, money, monthName, monthStart, shortDay, storedDay } from "./format";
import type { CreditNotesView, CreditQuery, CreditRow } from "./credit-notes-view";

/**
 * Books → Sales → Credit notes (BkCreditNotes): every credit note and
 * bad-debt write-off against the workspace's invoices. Both are raised from
 * an invoice (Credit, Write off) and undone by voiding.
 */

type Db = PrismaClient;

export const CREDITS_PAGE_SIZE = 50;
const midnight = (day: string) => new Date(`${day}T00:00:00.000Z`);
const STATE = { DRAFT: "Draft", ISSUED: "Issued", VOIDED: "Void", POSTED: "Posted" } as const;

export async function readCreditNotes(db: Db, companyId: string, query: CreditQuery, now = new Date()): Promise<CreditNotesView> {
  const today = dayOf(now);
  const from = midnight(monthStart(today));
  const invoiceFilter: Prisma.SalesInvoiceWhereInput = query.customer ? { customerId: query.customer } : {};
  const search = query.q
    ? [{ reason: { contains: query.q, mode: "insensitive" as const } }, { invoice: { invoiceNumber: { contains: query.q, mode: "insensitive" as const } } }, { invoice: { customer: { name: { contains: query.q, mode: "insensitive" as const } } } }]
    : undefined;
  const noteWhere: Prisma.CreditNoteWhereInput = { companyId, invoice: invoiceFilter, ...(search ? { OR: [...search, { noteNumber: { contains: query.q, mode: "insensitive" } }] } : {}) };
  const writeOffWhere: Prisma.SalesWriteOffWhereInput = { companyId, invoice: invoiceFilter, ...(search ? { OR: [...search, { writeOffNumber: { contains: query.q, mode: "insensitive" } }] } : {}) };
  const skip = (query.page - 1) * CREDITS_PAGE_SIZE;
  const [notes, writeOffs, noteCount, writeOffCount, monthNotes, monthWriteOffs, drafts, customers] = await Promise.all([
    query.view === "notes"
      ? db.creditNote.findMany({
          where: noteWhere,
          orderBy: [{ noteDate: "desc" }, { createdAt: "desc" }],
          skip,
          take: CREDITS_PAGE_SIZE,
          select: { id: true, noteNumber: true, noteDate: true, status: true, total: true, currency: true, reason: true, invoice: { select: { id: true, invoiceNumber: true, customer: { select: { name: true } } } } },
        })
      : Promise.resolve([]),
    query.view === "write-offs"
      ? db.salesWriteOff.findMany({
          where: writeOffWhere,
          orderBy: { createdAt: "desc" },
          skip,
          take: CREDITS_PAGE_SIZE,
          select: { id: true, writeOffNumber: true, createdAt: true, status: true, amount: true, reason: true, invoice: { select: { id: true, invoiceNumber: true, currency: true, customer: { select: { name: true } } } } },
        })
      : Promise.resolve([]),
    db.creditNote.count({ where: noteWhere }),
    db.salesWriteOff.count({ where: writeOffWhere }),
    db.creditNote.findMany({ where: { companyId, status: "ISSUED", noteDate: { gte: from } }, select: { total: true, currency: true } }),
    db.salesWriteOff.findMany({ where: { companyId, status: "POSTED", createdAt: { gte: from } }, select: { amount: true, invoice: { select: { currency: true } } } }),
    db.creditNote.findMany({ where: { companyId, status: "DRAFT" }, select: { total: true, invoice: { select: { customer: { select: { name: true } } } } } }),
    db.customer.findMany({ where: { companyId, invoices: { some: { OR: [{ creditNotes: { some: {} } }, { writeOffs: { some: {} } }] } } }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 500 }),
  ]);
  const currency = monthNotes[0]?.currency ?? monthWriteOffs[0]?.invoice.currency ?? "USD";
  const credited = monthNotes.filter((note) => note.currency === currency).reduce((sum, note) => sum + note.total, 0);
  const writtenOff = monthWriteOffs.filter((row) => row.invoice.currency === currency).reduce((sum, row) => sum + row.amount, 0);
  const rows: CreditRow[] =
    query.view === "notes"
      ? notes.map((note) => ({
          id: note.id,
          number: note.noteNumber ?? "Draft",
          customer: note.invoice.customer.name,
          invoice: { id: note.invoice.id, number: note.invoice.invoiceNumber ?? "Draft" },
          reason: note.reason ?? "",
          state: STATE[note.status],
          amount: note.total,
          currency: note.currency,
          date: shortDay(storedDay(note.noteDate)),
        }))
      : writeOffs.map((row) => ({
          id: row.id,
          number: row.writeOffNumber ?? "Write-off",
          customer: row.invoice.customer.name,
          invoice: { id: row.invoice.id, number: row.invoice.invoiceNumber ?? "Draft" },
          reason: row.reason ?? "",
          state: STATE[row.status],
          amount: row.amount,
          currency: row.invoice.currency,
          date: shortDay(dayOf(row.createdAt)),
        }));
  const matching = query.view === "notes" ? noteCount : writeOffCount;
  const first = matching === 0 ? 0 : skip + 1;
  const draftSum = drafts.reduce((sum, note) => sum + note.total, 0);
  return {
    finding:
      monthNotes.length === 0
        ? { fact: "Nothing was credited this month.", rest: drafts.length ? `${drafts[0].invoice.customer.name}'s credit note is still a draft.` : writtenOff > 0 ? `${money(writtenOff, currency)} was written off.` : null }
        : {
            fact: `${money(credited, currency)} was credited this month on ${count(monthNotes.length, "credit note")}.`,
            rest: drafts.length ? `${drafts[0].invoice.customer.name}'s is still a draft.` : null,
          },
    rows,
    range: { from: first, to: first === 0 ? 0 : first + rows.length - 1, of: matching },
    counts: { notes: noteCount, "write-offs": writeOffCount },
    month: { name: monthName(today), amount: Math.round((query.view === "notes" ? credited : writtenOff) * 100) / 100, drafts: Math.round(draftSum * 100) / 100 },
    currency,
    customers,
    query,
  };
}
