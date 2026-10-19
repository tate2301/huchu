import { Prisma, type PrismaClient } from "@prisma/client";

import { blockingWhere } from "./needs-posting";

/**
 * The figures beside Books' panel rows (design/core-modules, BooksInvoices):
 * only where the board draws one and a count is one indexed query.
 *
 * - Invoices: invoices sent, not yet paid and past their due date (books_nav.py: [overdue]).
 * - Payments received: money a customer paid that sits on account, on no invoice.
 * - Bank: statement lines in an open reconciliation that match nothing yet.
 * - Takings: tills closed on a day that has not been closed and banked.
 * - Needs posting: money that has not reached the ledger (FAILED, or waiting over an hour).
 * - Bills: bills recorded and owing that fall due by Sunday (books_nav.py: [due this week]).
 * - Requisitions and Claims & petty cash: those waiting for approval ([to approve]).
 *
 * Keyed by the row's address, as the shell's badges are. A zero is left out.
 */

type Db = Pick<PrismaClient, "salesInvoice" | "salesReceipt" | "bankStatementLine" | "accountingIntegrationEvent" | "purchaseBill" | "crmRequisition" | "expenseClaim" | "pettyCashVoucher" | "$queryRaw">;

export const BOOKS_COUNT_HREFS = {
  invoices: "/books/invoices",
  onAccount: "/books/payments",
  bank: "/books/bank",
  takings: "/books/takings",
  needs: "/books/needs-posting",
  bills: "/books/bills",
  requisitions: "/books/requisitions",
  claims: "/books/claims",
} as const;

export type BooksCounts = { invoices: number; onAccount: number; bank: number; takings: number; needs: number; bills: number; requisitions: number; claims: number };

/** The Sunday that ends this week, as a date to compare due dates with (today, when today is Sunday). */
export function endOfWeek(today: Date): Date {
  const day = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  day.setUTCDate(day.getUTCDate() + ((7 - day.getUTCDay()) % 7) + 1);
  return day;
}

/** The badges the panel draws: a figure per row, none for a zero. */
export function booksBadges(counts: BooksCounts): Record<string, string> {
  const badges: Record<string, string> = {};
  for (const key of Object.keys(BOOKS_COUNT_HREFS) as Array<keyof BooksCounts>) {
    if (counts[key] > 0) badges[BOOKS_COUNT_HREFS[key]] = String(counts[key]);
  }
  return badges;
}

export async function readBooksCounts(
  db: Db,
  companyId: string,
  { takings = true }: { takings?: boolean } = {},
): Promise<BooksCounts> {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const [invoices, onAccount, bank, unbanked, needs, bills, requisitions, claims, vouchers] = await Promise.all([
    db.salesInvoice.count({ where: { companyId, status: "ISSUED", dueDate: { lt: today } } }),
    db.salesReceipt.count({ where: { companyId, invoiceId: null, voidedAt: null } }),
    db.bankStatementLine.count({ where: { matchedTransactionId: null, reconciliation: { companyId, status: "OPEN" } } }),
    takings
      ? db.$queryRaw<Array<{ count: number }>>(Prisma.sql`
          SELECT count(*)::int AS count
          FROM "RetailShift" s
          WHERE s."companyId" = ${companyId}
            AND s."status" = 'CLOSED'
            AND NOT EXISTS (
              SELECT 1 FROM "RetailDayClose" d
              WHERE d."companyId" = s."companyId"
                AND d."siteId" = s."siteId"
                AND d."businessDate" = ((s."openedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Harare')::date
            )`)
      : Promise.resolve([{ count: 0 }]),
    db.accountingIntegrationEvent.count({ where: blockingWhere(companyId, now) }),
    db.purchaseBill.count({ where: { companyId, status: "RECEIVED", dueDate: { lt: endOfWeek(now) } } }),
    db.crmRequisition.count({ where: { companyId, status: "SUBMITTED" } }),
    db.expenseClaim.count({ where: { companyId, status: "SUBMITTED" } }),
    db.pettyCashVoucher.count({ where: { companyId, status: "TO_APPROVE" } }),
  ]);
  return { invoices, onAccount, bank, takings: unbanked[0]?.count ?? 0, needs, bills, requisitions, claims: claims + vouchers };
}
