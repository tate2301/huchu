import { count, dayOf } from "@/lib/books/format";
import { openInvoicesByAge, owedAndOverdue } from "@/lib/books/invoices";
import { cameIn, wentOut } from "@/lib/books/money";
import { prisma } from "@/lib/prisma";
import { result, TAKE } from "@/lib/reports/loaders/shared";
import type { ReportContext, ReportLoader } from "@/lib/reports/types";

/** Money this month, from the core's one money in/out: what came in from each source, and what went out. */
async function loadMoneyMonth(ctx: ReportContext) {
  const today = dayOf(new Date());
  const { currency } = await owedAndOverdue(prisma, ctx.companyId, today);
  const [sources, out] = await Promise.all([cameIn(prisma, ctx.companyId, today, currency), wentOut(prisma, ctx.companyId, today, currency)]);
  const rows = sources.map((source) => ({
    id: `in-${source.key}`,
    source: source.label,
    direction: "In",
    detail: source.detail,
    count: source.count,
    amount: source.amount,
  }));
  for (const flow of out.flows) {
    const supplier = flow.key === "supplier-payments";
    rows.push({
      id: supplier ? "out-bills" : `out-${flow.key}`,
      source: supplier ? "Bills" : "Requisitions",
      direction: "Out",
      detail: supplier ? `${count(flow.count, "payment")} to suppliers` : `${count(flow.count, "requisition")} paid out`,
      count: flow.count,
      amount: -flow.amount,
    });
  }
  return result(rows);
}

/** Owed to you, by age: every invoice with money owing, filed by how late it is. */
async function loadOwedByAge(ctx: ReportContext) {
  const rows = await openInvoicesByAge(prisma, ctx.companyId, new Date(), TAKE);
  return result(
    rows.map((row) => ({
      id: row.id,
      bucket: row.bucket,
      invoice: row.number,
      customer: row.customer.name,
      due: row.due,
      daysLate: row.daysOverdue,
      currency: row.currency,
      balance: row.balance,
    })),
  );
}

export const BOOKS_LOADERS: Record<string, ReportLoader> = {
  "books-money-month": { load: loadMoneyMonth },
  "books-owed-by-age": { load: loadOwedByAge },
};
