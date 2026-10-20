import type { PrismaClient } from "@prisma/client";
import { docLabel } from "@/lib/books/doc-number";

import { dayOf, longDay, storedDay } from "./format";
import { invoiceBalance, invoiceState } from "./invoice-state";

/**
 * Books → Invoices → Print statements: for each customer chosen, every invoice
 * with money still owed on it and what it comes to, as of today.
 */

export type Statement = {
  customer: { id: string; name: string; address: string | null };
  lines: Array<{ number: string; written: string; when: string; total: number; balance: number; currency: string }>;
  owing: Array<{ currency: string; amount: number }>;
};

export async function readStatements(
  db: Pick<PrismaClient, "customer" | "salesInvoice">,
  companyId: string,
  customerIds: string[],
  now = new Date(),
): Promise<{ asOf: string; statements: Statement[] }> {
  const today = dayOf(now);
  const [customers, invoices] = await Promise.all([
    db.customer.findMany({ where: { companyId, id: { in: customerIds } }, select: { id: true, name: true, address: true }, orderBy: { name: "asc" } }),
    db.salesInvoice.findMany({
      where: { companyId, customerId: { in: customerIds }, status: "ISSUED" },
      select: {
        customerId: true,
        invoiceNumber: true,
        invoiceDate: true,
        dueDate: true,
        status: true,
        currency: true,
        total: true,
        amountPaid: true,
        creditTotal: true,
        writeOffTotal: true,
      },
      orderBy: { invoiceDate: "asc" },
    }),
  ]);
  const statements = customers.map((customer) => {
    const lines = invoices
      .filter((invoice) => invoice.customerId === customer.id && invoiceBalance(invoice) > 0)
      .map((invoice) => ({
        number: docLabel(invoice.invoiceNumber),
        written: longDay(storedDay(invoice.invoiceDate)),
        when: invoiceState({ ...invoice, lastReceipt: null }, today).when,
        total: invoice.total,
        balance: invoiceBalance(invoice),
        currency: invoice.currency,
      }));
    const byCurrency = new Map<string, number>();
    for (const line of lines) byCurrency.set(line.currency, (byCurrency.get(line.currency) ?? 0) + line.balance);
    return {
      customer,
      lines,
      owing: [...byCurrency.entries()].map(([currency, amount]) => ({ currency, amount: Math.round(amount * 100) / 100 })),
    };
  });
  return { asOf: longDay(today), statements };
}
