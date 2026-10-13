import { z } from "zod";

import { acceptProposals } from "@/lib/books/bank";
import { DueDateRefused, setInvoiceDueDate } from "@/lib/books/due-dates";
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

export const BOOKS_ACTIONS = [dueDate, reminders, bankMatches] as const;
