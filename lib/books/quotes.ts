import type { Prisma, PrismaClient } from "@prisma/client";

import { count, dayOf, money, shortDay, storedDay } from "./format";
import { QUOTE_STATUS, QUOTE_VIEWS, type QuoteQuery, type QuoteRow, type QuotesView } from "./quotes-view";

/**
 * Books → Sales → Quotes (BkQuotes): the same `SalesQuotation` rows the CRM
 * writes, so the CRM's quote screen and this one show the same quotes. A
 * quote never posts.
 */

type Db = PrismaClient;

export const QUOTES_PAGE_SIZE = 50;

function quoteWhere(companyId: string, query: QuoteQuery): Prisma.SalesQuotationWhereInput {
  const where: Prisma.SalesQuotationWhereInput = { companyId, status: QUOTE_STATUS[query.view] };
  if (query.customer) where.customerId = query.customer;
  if (query.q) {
    where.OR = [
      { quotationNumber: { contains: query.q, mode: "insensitive" } },
      { customer: { name: { contains: query.q, mode: "insensitive" } } },
      { lines: { some: { description: { contains: query.q, mode: "insensitive" } } } },
    ];
  }
  return where;
}

export async function readQuotes(db: Db, companyId: string, query: QuoteQuery, now = new Date()): Promise<QuotesView> {
  const today = dayOf(now);
  const where = quoteWhere(companyId, query);
  const [records, matching, sent, customers, ...counts] = await Promise.all([
    db.salesQuotation.findMany({
      where,
      orderBy: [{ quotationDate: "desc" }, { quotationNumber: "desc" }],
      skip: (query.page - 1) * QUOTES_PAGE_SIZE,
      take: QUOTES_PAGE_SIZE,
      select: {
        id: true,
        quotationNumber: true,
        validUntil: true,
        total: true,
        currency: true,
        issuedAt: true,
        customer: { select: { name: true } },
        lines: { orderBy: { createdAt: "asc" }, take: 1, select: { description: true } },
        crmLeadDocuments: { take: 1, select: { id: true, approval: { select: { firstViewedAt: true } } } },
        invoicesRaised: { take: 1, select: { id: true } },
      },
    }),
    db.salesQuotation.count({ where }),
    db.salesQuotation.findMany({ where: { companyId, status: "SENT" }, select: { total: true, currency: true, validUntil: true, customer: { select: { name: true } } } }),
    db.customer.findMany({ where: { companyId, quotations: { some: {} } }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 500 }),
    ...QUOTE_VIEWS.map((view) => db.salesQuotation.count({ where: quoteWhere(companyId, { ...query, view }) })),
  ]);
  const byCurrency = new Map<string, number>();
  for (const quote of sent) byCurrency.set(quote.currency, (byCurrency.get(quote.currency) ?? 0) + 1);
  const currency = [...byCurrency.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "USD";
  const live = sent.filter((quote) => quote.currency === currency);
  const out = Math.round(live.reduce((sum, quote) => sum + quote.total, 0) * 100) / 100;
  const soon = live
    .filter((quote) => quote.validUntil && storedDay(quote.validUntil) >= today)
    .sort((a, b) => storedDay(a.validUntil!).localeCompare(storedDay(b.validUntil!)))[0];
  const rows: QuoteRow[] = records.map((record) => {
    const doc = record.crmLeadDocuments[0];
    return {
      id: record.id,
      number: record.quotationNumber,
      customer: record.customer.name,
      forWhat: record.lines[0]?.description ?? "",
      validUntil: record.validUntil ? shortDay(storedDay(record.validUntil)) : null,
      whatsapp: doc?.approval?.firstViewedAt ? `Read ${shortDay(dayOf(doc.approval.firstViewedAt))}` : doc ? "Sent" : null,
      amount: record.total,
      currency: record.currency,
      crmId: doc?.id ?? null,
      invoiced: record.invoicesRaised.length > 0,
    };
  });
  const from = matching === 0 ? 0 : (query.page - 1) * QUOTES_PAGE_SIZE + 1;
  return {
    finding:
      live.length === 0
        ? { fact: "No quote is with a customer.", rest: null }
        : {
            fact: `${count(live.length, "quote")} worth ${money(out, currency)} ${live.length === 1 ? "is" : "are"} with customers.`,
            rest: soon ? `${soon.customer.name}'s ${money(soon.total, currency)} runs out on ${shortDay(storedDay(soon.validUntil!))}.` : null,
          },
    rows,
    range: { from, to: from === 0 ? 0 : from + rows.length - 1, of: matching },
    counts: Object.fromEntries(QUOTE_VIEWS.map((view, index) => [view, counts[index] ?? 0])) as QuotesView["counts"],
    out,
    currency,
    customers,
    query,
  };
}
