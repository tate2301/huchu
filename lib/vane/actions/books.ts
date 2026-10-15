import { z } from "zod";

import { acceptProposals } from "@/lib/books/bank";
import { InvoiceRefused } from "@/lib/books/create-invoice";
import { DueDateRefused, setInvoiceDueDate } from "@/lib/books/due-dates";
import { deleteVaneDraftInvoice, DraftInvoiceRefused, issueDraftInvoice } from "@/lib/books/issue-invoice";
import { draftInvoiceFromQuote, QuotationRefused } from "@/lib/books/quotations";
import { sendInvoiceReminders } from "@/lib/books/reminders";
import { prisma } from "@/lib/prisma";

import { listOf, longDay, refuseUnlessRoute } from "./gate";
import { VaneActionError, type VaneActionKind } from "./types";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Write it as a day, like 2026-10-30.");

const dueDate = {
  kind: "books.invoice.due_date",
  module: "books",
  description:
    "Give one invoice a due date, or move it. For an invoice with no due date, propose the customer's usual terms from their past invoices. One action per invoice.",
  params: z.object({
    invoiceId: z.string().min(1),
    invoiceNumber: z.string().min(1).describe('As the invoice shows it: "INV-0142".'),
    customerId: z.string().min(1).optional(),
    dueDate: day,
  }),
  fields: [{ name: "dueDate", label: "Due on", type: "date" }],
  verb: () => "Set the due date",
  title: (p) => `Set ${p.invoiceNumber} due on ${longDay(p.dueDate)}`,
  target: (p) => `/books/invoices?q=${encodeURIComponent(p.invoiceNumber)}`,
  refuse: (context) => refuseUnlessRoute(context, "/api/accounting/sales/invoices", "PATCH"),
  async run(context, p) {
    try {
      const set = await setInvoiceDueDate(prisma, { companyId: context.companyId, invoiceId: p.invoiceId, dueDate: p.dueDate });
      return `${set.invoiceNumber} is due on ${longDay(set.dueDate)}.`;
    } catch (error) {
      if (error instanceof DueDateRefused) throw new VaneActionError(error.message);
      throw error;
    }
  },
} satisfies VaneActionKind<{ invoiceId: string; invoiceNumber: string; customerId?: string; dueDate: string }>;

const reminders = {
  kind: "books.invoice.reminders",
  module: "books",
  description:
    "Send WhatsApp payment reminders for issued invoices that are still owed, through Books' own reminders. Only invoices with a balance go; the rest are skipped with the reason.",
  params: z.object({
    invoiceIds: z.array(z.string().min(1)).min(1).max(50),
    invoiceNumbers: z.array(z.string().min(1)).min(1).max(50),
    customerId: z.string().min(1).optional().describe("When every invoice is one customer's, so the page opens on them."),
  }),
  fields: [],
  verb: (p) => (p.invoiceIds.length === 1 ? "Send the reminder" : `Send ${p.invoiceIds.length} reminders`),
  title: (p) => `Send a WhatsApp reminder for ${listOf(p.invoiceNumbers)}`,
  target: (p) => `/books/invoices?view=overdue${p.customerId ? `&customer=${encodeURIComponent(p.customerId)}` : ""}`,
  refuse: (context) => refuseUnlessRoute(context, "/api/books/invoices/reminders"),
  async run(context, p) {
    const outcome = await sendInvoiceReminders(prisma, { companyId: context.companyId, invoiceIds: p.invoiceIds });
    if (outcome.sent.length === 0) {
      throw new VaneActionError(`No reminder went: ${outcome.skipped.map((row) => `${row.invoice}, ${row.why}`).join("; ") || "none was owed"}.`);
    }
    const skipped = outcome.skipped.length ? ` Not sent: ${outcome.skipped.map((row) => `${row.invoice} (${row.why})`).join(", ")}.` : "";
    return `Sent ${outcome.sent.length === 1 ? "a reminder" : `${outcome.sent.length} reminders`} for ${listOf(outcome.sent)}.${skipped}`;
  },
} satisfies VaneActionKind<{ invoiceIds: string[]; invoiceNumbers: string[]; customerId?: string }>;

const bankMatches = {
  kind: "books.bank.accept",
  module: "books",
  description:
    "Accept Books' proposed matches for bank lines: each line is recorded against the invoice, bill or charge Books matched it to, checked again as the books stand now.",
  params: z.object({
    lineIds: z.array(z.string().min(1)).min(1).max(100),
    accountId: z.string().min(1).optional(),
  }),
  fields: [],
  verb: (p) => (p.lineIds.length === 1 ? "Accept the match" : `Accept ${p.lineIds.length} matches`),
  title: (p) => `Accept Books' match${p.lineIds.length === 1 ? "" : "es"} for ${p.lineIds.length} bank line${p.lineIds.length === 1 ? "" : "s"}`,
  target: (p) => `/books/bank?tab=to-match${p.accountId ? `&account=${encodeURIComponent(p.accountId)}` : ""}`,
  refuse: (context) => refuseUnlessRoute(context, "/api/books/bank/accept"),
  async run(context, p) {
    const outcome = await acceptProposals(prisma, { companyId: context.companyId, userId: context.userId, role: context.role, lineIds: p.lineIds });
    if (outcome.accepted === 0) throw new VaneActionError(`None was accepted: ${outcome.failed.map((row) => row.error).join("; ")}`);
    return `Accepted ${outcome.accepted} match${outcome.accepted === 1 ? "" : "es"}.${outcome.failed.length ? ` ${outcome.failed.length} could not be: ${outcome.failed[0]?.error}` : ""}`;
  },
} satisfies VaneActionKind<{ lineIds: string[]; accountId?: string }>;

const fromQuote = {
  kind: "books.invoice.from_quote",
  module: "books",
  description:
    "Draft the invoice for an accepted quotation that has not been invoiced, line for line. It stays a draft: a person issues it from Books. Propose the customer's usual terms as the due date.",
  params: z.object({
    quotationId: z.string().min(1),
    quotationNumber: z.string().min(1).describe('As the quotation shows it: "QT-0031".'),
    customerId: z.string().min(1).optional(),
    customer: z.string().min(1).describe("The customer's name."),
    invoiceDate: day,
    dueDate: z.preprocess((value) => (value === "" || value === null ? undefined : value), day.optional()),
  }),
  fields: [
    { name: "invoiceDate", label: "Dated", type: "date" },
    { name: "dueDate", label: "Due on", type: "date" },
  ],
  verb: () => "Draft the invoice",
  title: (p) => `Draft the invoice for ${p.quotationNumber}, ${p.customer}${p.dueDate ? `, due ${longDay(p.dueDate)}` : ""}`,
  target: (p) => `/books/invoices?view=drafts${p.customerId ? `&customer=${encodeURIComponent(p.customerId)}` : `&q=${encodeURIComponent(p.customer)}`}`,
  refuse: (context) => refuseUnlessRoute(context, "/api/accounting/sales/invoices"),
  async run(context, p) {
    try {
      const invoice = await draftInvoiceFromQuote(
        { companyId: context.companyId, userId: context.userId },
        { quotationId: p.quotationId, invoiceDate: p.invoiceDate, dueDate: p.dueDate },
      );
      return `Drafted ${invoice.invoiceNumber} for ${invoice.customer.name}, ${invoice.currency} ${invoice.total.toFixed(2)}. Issue it from Books when it is right.`;
    } catch (error) {
      if (error instanceof QuotationRefused || error instanceof InvoiceRefused) throw new VaneActionError(error.message);
      throw error;
    }
  },
} satisfies VaneActionKind<{ quotationId: string; quotationNumber: string; customerId?: string; customer: string; invoiceDate: string; dueDate?: string }>;

const issue = {
  kind: "books.invoice.issue",
  module: "books",
  description:
    "Issue a draft invoice (Vane's or a person's) once the person has checked it: it is posted to the books and fiscalised where the workspace does, and can then be sent. Use for an invoice you drafted.",
  params: z.object({
    invoiceId: z.string().min(1),
    invoiceNumber: z.string().min(1),
    customer: z.string().min(1),
    total: z.string().min(1).describe('As it reads: "USD 6,400.18".'),
  }),
  fields: [],
  verb: () => "Issue it",
  title: (p) => `Issue ${p.invoiceNumber} to ${p.customer}, ${p.total}`,
  target: (p) => `/books/invoices/${p.invoiceId}`,
  refuse: (context) => refuseUnlessRoute(context, "/api/accounting/sales/invoices", "PATCH"),
  async run(context, p) {
    try {
      const issued = await issueDraftInvoice({ companyId: context.companyId, userId: context.userId }, p.invoiceId);
      return `${issued.invoiceNumber} is issued to ${issued.customer.name}. Send it from Books.`;
    } catch (error) {
      if (error instanceof DraftInvoiceRefused) throw new VaneActionError(error.message);
      throw error;
    }
  },
} satisfies VaneActionKind<{ invoiceId: string; invoiceNumber: string; customer: string; total: string }>;

const discard = {
  kind: "books.invoice.discard",
  module: "books",
  description: "Delete a draft invoice Vane made that nobody issued, when it is not wanted. A person's own drafts are not Vane's to delete.",
  params: z.object({ invoiceId: z.string().min(1), invoiceNumber: z.string().min(1) }),
  fields: [],
  verb: () => "Delete the draft",
  title: (p) => `Delete Vane's draft ${p.invoiceNumber}`,
  target: (p) => `/books/invoices/${p.invoiceId}`,
  refuse: (context) => refuseUnlessRoute(context, "/api/accounting/sales/invoices", "PATCH"),
  async run(context, p) {
    try {
      const gone = await deleteVaneDraftInvoice(context.companyId, p.invoiceId);
      return `${gone.invoiceNumber} is deleted.`;
    } catch (error) {
      if (error instanceof DraftInvoiceRefused) throw new VaneActionError(error.message);
      throw error;
    }
  },
} satisfies VaneActionKind<{ invoiceId: string; invoiceNumber: string }>;

export const BOOKS_ACTIONS = [dueDate, reminders, bankMatches, fromQuote, issue, discard] as const;
