import type { Prisma, PrismaClient } from "@prisma/client";

import { asOf, count, dayOf, daysBetween, shortDay, storedDay } from "./format";
import { QUOTE_STATUS, QUOTE_VIEWS, QUOTES_PAGE_SIZE, type QuoteQuery, type QuoteRow, type QuotesView, type QuoteTab, type QuoteValid } from "./quotes-view";

/**
 * Books → Sales → Quotes (bk-quotes): the `SalesQuotation` rows the CRM
 * writes from its deals, each opening at its one address in Books. A quote
 * never posts.
 */

type Db = PrismaClient;


const midnight = (day: string) => new Date(`${day}T00:00:00.000Z`);
const TAB_OF: Record<string, QuoteTab> = { DRAFT: "draft", SENT: "sent", ACCEPTED: "accepted", EXPIRED: "expired", VOIDED: "void" };

function validRange(valid: QuoteValid, today: string): Prisma.DateTimeNullableFilter | null {
  if (valid === "any") return null;
  if (valid === "passed") return { lt: midnight(today) };
  const end = new Date(midnight(today));
  if (valid === "this-week") end.setUTCDate(end.getUTCDate() + ((7 - end.getUTCDay()) % 7) + 1);
  else end.setUTCMonth(end.getUTCMonth() + 1, 1);
  return { gte: midnight(today), lt: end };
}

function quoteWhere(companyId: string, query: QuoteQuery, today: string): Prisma.SalesQuotationWhereInput {
  const where: Prisma.SalesQuotationWhereInput = { companyId, status: QUOTE_STATUS[query.view] };
  if (query.customer) where.customerId = query.customer;
  if (query.rep) where.createdById = query.rep;
  const valid = validRange(query.valid, today);
  if (valid) where.validUntil = valid;
  if (query.q) {
    where.OR = [
      { quotationNumber: { contains: query.q, mode: "insensitive" } },
      { customer: { name: { contains: query.q, mode: "insensitive" } } },
      { lines: { some: { description: { contains: query.q, mode: "insensitive" } } } },
    ];
  }
  return where;
}

type Next = {
  state: QuoteTab;
  validUntil: Date | null;
  createdAt: Date;
  viewed: Date | null;
  invoice: { number: string | null; status: string } | null;
  sentAgainAs: string | null;
};

/** What the Next column says: what happens next, or what happened last. */
export function quoteNext(row: Next, today: string, now: Date): string {
  if (row.state === "draft") return `Written ${shortDay(dayOf(row.createdAt))}`;
  if (row.state === "void") return "Voided";
  if (row.state === "expired") return row.sentAgainAs ? `Sent again as ${row.sentAgainAs}` : row.validUntil ? `Ran out ${shortDay(storedDay(row.validUntil))}` : "Ran out";
  if (row.state === "accepted") {
    if (!row.invoice) return "Make the invoice";
    return row.invoice.status === "DRAFT" ? "Draft invoice written" : `Invoiced as ${row.invoice.number}`;
  }
  const left = row.validUntil ? daysBetween(today, storedDay(row.validUntil)) : null;
  if (left !== null && left >= 0 && left <= 3) return left === 0 ? "Expires today" : `Expires in ${count(left, "day")}`;
  if (row.viewed) return `Opened ${asOf(row.viewed, now).replace(/^Today/, "today").replace(/^Yesterday/, "yesterday")}`;
  return "Not opened yet";
}

export async function readQuotes(db: Db, companyId: string, query: QuoteQuery, now = new Date()): Promise<QuotesView> {
  const today = dayOf(now);
  const where = quoteWhere(companyId, query, today);
  const [records, matching, customers, reps, ...counts] = await Promise.all([
    db.salesQuotation.findMany({
      where,
      orderBy: [{ quotationDate: query.sort === "newest" ? "desc" : "asc" }, { quotationNumber: query.sort === "newest" ? "desc" : "asc" }],
      skip: (query.page - 1) * QUOTES_PAGE_SIZE,
      take: QUOTES_PAGE_SIZE,
      select: {
        id: true,
        quotationNumber: true,
        status: true,
        validUntil: true,
        total: true,
        currency: true,
        issuedAt: true,
        createdAt: true,
        customer: { select: { name: true } },
        crmLeadDocuments: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { id: true, approval: { select: { firstViewedAt: true } }, supersededBy: { select: { quotation: { select: { quotationNumber: true } } }, take: 1 } },
        },
        invoicesRaised: { orderBy: { createdAt: "desc" }, take: 1, select: { invoiceNumber: true, status: true } },
      },
    }),
    db.salesQuotation.count({ where }),
    db.customer.findMany({ where: { companyId, quotations: { some: {} } }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 500 }),
    db.user.findMany({ where: { companyId, createdSalesQuotations: { some: { companyId } } }, select: { id: true, name: true, image: true }, orderBy: { name: "asc" }, take: 200 }),
    ...QUOTE_VIEWS.map((view) => db.salesQuotation.count({ where: quoteWhere(companyId, { ...query, view }, today) })),
  ]);
  const rows: QuoteRow[] = records.map((record) => {
    const doc = record.crmLeadDocuments[0];
    const state = TAB_OF[record.status] ?? "draft";
    const invoice = record.invoicesRaised[0];
    return {
      id: record.id,
      number: state === "draft" ? "No number" : record.quotationNumber,
      customer: record.customer.name,
      sent: state === "draft" ? null : shortDay(storedDay(record.issuedAt ?? record.createdAt)),
      validUntil: state === "draft" || !record.validUntil ? null : shortDay(storedDay(record.validUntil)),
      state,
      next: quoteNext(
        {
          state,
          validUntil: record.validUntil,
          createdAt: record.createdAt,
          viewed: doc?.approval?.firstViewedAt ?? null,
          invoice: invoice ? { number: invoice.invoiceNumber, status: invoice.status } : null,
          sentAgainAs: doc?.supersededBy[0]?.quotation?.quotationNumber ?? null,
        },
        today,
        now,
      ),
      amount: record.total,
      currency: record.currency,
      href: doc ? `/books/quotes/${doc.id}` : null,
      invoiced: Boolean(invoice),
    };
  });
  const currency = rows[0]?.currency ?? "USD";
  const from = matching === 0 ? 0 : (query.page - 1) * QUOTES_PAGE_SIZE + 1;
  return {
    rows,
    range: { from, to: from === 0 ? 0 : from + rows.length - 1, of: matching },
    counts: Object.fromEntries(QUOTE_VIEWS.map((view, index) => [view, counts[index] ?? 0])) as QuotesView["counts"],
    total: Math.round(rows.filter((row) => row.currency === currency).reduce((sum, row) => sum + row.amount, 0) * 100) / 100,
    currency,
    customers,
    reps,
    query,
  };
}
