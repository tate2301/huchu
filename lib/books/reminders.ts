import type { PrismaClient } from "@prisma/client";

import { sendTemplate, WHATSAPP_NOT_SET_UP, type SendResult, type WhatsAppTemplate } from "@/lib/messaging/whatsapp";

import { count, dayOf, daysBetween, longDay, money, storedDay } from "./format";
import { invoiceBalance } from "./invoice-state";

/**
 * Books → Invoices → Send reminders: one WhatsApp to each selected invoice's
 * customer, sent when a person presses the button and never otherwise.
 *
 * Like every message the business starts, it goes as an approved template
 * (lib/retail/messages/drain.ts): "invoice-reminder", a UTILITY template with
 * {{1}} the business's name and {{2}} the reminder, for example "A reminder
 * from {{1}}: {{2}}".
 */

export const INVOICE_REMINDER_TEMPLATE = "invoice-reminder";

export type ReminderInvoice = {
  number: string;
  currency: string;
  balance: number;
  /** `YYYY-MM-DD`, or null when it has no due day. */
  due: string | null;
};

/** "Invoice INV-0131 has $1,240.00 still to pay. It was due on 24 September, 12 days ago. If you have paid it, reply and we will check." */
export function reminderText(invoice: ReminderInvoice, today: string): string {
  const owing = `Invoice ${invoice.number} has ${money(invoice.balance, invoice.currency)} still to pay.`;
  let when = "";
  if (invoice.due) {
    const late = daysBetween(invoice.due, today);
    when =
      late > 0
        ? ` It was due on ${longDay(invoice.due)}, ${count(late, "day")} ago.`
        : late === 0
          ? " It is due today."
          : ` It is due on ${longDay(invoice.due)}.`;
  }
  return `${owing}${when} If you have paid it, reply and we will check.`;
}

export type ReminderOutcome = {
  sent: string[];
  skipped: Array<{ invoice: string; why: string }>;
};

type Db = Pick<PrismaClient, "salesInvoice" | "companyBranding" | "company">;
type Send = (to: string, template: WhatsAppTemplate) => Promise<SendResult>;

export async function sendInvoiceReminders(
  db: Db,
  { companyId, invoiceIds, now = new Date(), send = sendTemplate }: { companyId: string; invoiceIds: string[]; now?: Date; send?: Send },
): Promise<ReminderOutcome> {
  const today = dayOf(now);
  const [invoices, branding, company] = await Promise.all([
    db.salesInvoice.findMany({
      where: { companyId, id: { in: invoiceIds } },
      select: {
        invoiceNumber: true,
        status: true,
        currency: true,
        dueDate: true,
        total: true,
        amountPaid: true,
        creditTotal: true,
        writeOffTotal: true,
        customer: { select: { name: true, phone: true, whatsapp: true } },
      },
      orderBy: { invoiceNumber: "asc" },
    }),
    db.companyBranding.findUnique({ where: { companyId }, select: { tradingName: true, displayName: true } }),
    db.company.findUnique({ where: { id: companyId }, select: { name: true } }),
  ]);
  const business = branding?.tradingName || branding?.displayName || company?.name || "us";
  const outcome: ReminderOutcome = { sent: [], skipped: [] };
  for (const [index, invoice] of invoices.entries()) {
    const balance = invoiceBalance(invoice);
    if (invoice.status !== "ISSUED" || balance <= 0) {
      outcome.skipped.push({ invoice: invoice.invoiceNumber, why: invoice.status === "DRAFT" ? "it has not been sent" : "nothing is owed on it" });
      continue;
    }
    const to = invoice.customer.whatsapp || invoice.customer.phone;
    if (!to) {
      outcome.skipped.push({ invoice: invoice.invoiceNumber, why: `${invoice.customer.name} has no phone number` });
      continue;
    }
    const text = reminderText(
      { number: invoice.invoiceNumber, currency: invoice.currency, balance, due: invoice.dueDate ? storedDay(invoice.dueDate) : null },
      today,
    );
    const result = await send(to, { name: INVOICE_REMINDER_TEMPLATE, params: [business, text] });
    if (result.ok) outcome.sent.push(invoice.invoiceNumber);
    else if (result.error === WHATSAPP_NOT_SET_UP) {
      // Nothing else will go either.
      for (const rest of invoices.slice(index)) outcome.skipped.push({ invoice: rest.invoiceNumber, why: "WhatsApp is not connected" });
      break;
    } else outcome.skipped.push({ invoice: invoice.invoiceNumber, why: result.error });
  }
  return outcome;
}
