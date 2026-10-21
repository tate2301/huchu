import type { Prisma, PrismaClient } from "@prisma/client";

import { customerFace, customerImage } from "./faces";
import { addDays, asOf, count, dayOf, daysBetween, money, shortDay, storedDay } from "./format";
import { QUOTE_STATUS, QUOTE_VIEWS, type QuoteQuery, type QuoteRow, type QuoteTab, type QuotesView } from "./quotes-view";

/**
 * Books → Sales → Quotes (BkQuotes): the same `SalesQuotation` rows the CRM
 * writes, so the CRM's quote screen and this one show the same quotes. A
 * quote never posts.
 */

type Db = PrismaClient;

export const QUOTES_PAGE_SIZE = 50;

function quoteWhere(companyId: string, query: QuoteQuery, today = dayOf(new Date())): Prisma.SalesQuotationWhereInput {
  const where: Prisma.SalesQuotationWhereInput = { companyId, status: QUOTE_STATUS[query.view] };
  if (query.customer) where.customerId = query.customer;
  if (query.rep) where.createdById = query.rep;
  if (query.invoiced === "yes") where.invoicesRaised = { some: {} };
  if (query.invoiced === "no") where.invoicesRaised = { none: {} };
  if (query.validity === "soon") where.validUntil = { gte: midnight(today), lte: midnight(addDays(today, 7)) };
  if (query.validity === "past") where.validUntil = { lt: midnight(today) };
  if (query.q) {
    where.OR = [
      { quotationNumber: { contains: query.q, mode: "insensitive" } },
      { customer: { name: { contains: query.q, mode: "insensitive" } } },
      { lines: { some: { description: { contains: query.q, mode: "insensitive" } } } },
    ];
  }
  return where;
}

/** Midnight UTC of a calendar day: how the valid-until column is stored. */
const midnight = (day: string) => new Date(`${day}T00:00:00.000Z`);

/** What happens next to a quote, only from what the records show. */
function nextStep(
  record: {
    status: string;
    validUntil: Date | null;
    crmLeadDocuments: Array<{ approval: { firstViewedAt: Date | null } | null }>;
    invoicesRaised: Array<{ invoiceNumber: string | null; status: string }>;
    supersededBy: Array<{ quotationNumber: string }>;
  },
  today: string,
  now: Date,
): string | null {
  const replacement = record.supersededBy[0]?.quotationNumber;
  if (record.status === "ACCEPTED") {
    const invoice = record.invoicesRaised[0];
    if (!invoice) return "No invoice yet";
    return invoice.status === "DRAFT" || !invoice.invoiceNumber ? "Draft invoice written" : `Invoice ${invoice.invoiceNumber}`;
  }
  if (record.status === "EXPIRED") return replacement ? `Sent again as ${replacement}` : null;
  if (record.status === "VOIDED") return replacement ? `Revised as ${replacement}` : null;
  if (record.status !== "SENT") return null;
  if (record.validUntil) {
    const left = daysBetween(today, storedDay(record.validUntil));
    if (left < 0) return left === -1 ? "Expired yesterday" : `Expired ${-left} days ago`;
    if (left <= 7) return left === 0 ? "Expires today" : left === 1 ? "Expires tomorrow" : `Expires in ${left} days`;
  }
  const doc = record.crmLeadDocuments[0];
  if (!doc) return null;
  const viewed = doc.approval?.firstViewedAt;
  if (!viewed) return "Not opened yet";
  const when = asOf(viewed, now);
  return `Opened ${/^(Today|Yesterday)/.test(when) ? when[0].toLowerCase() + when.slice(1) : when}`;
}

export async function readQuotes(db: Db, companyId: string, query: QuoteQuery, now = new Date()): Promise<QuotesView> {
  const today = dayOf(now);
  const where = quoteWhere(companyId, query, today);
  const [records, matching, sent, customers, reps, ...counts] = await Promise.all([
    db.salesQuotation.findMany({
      where,
      orderBy: [{ quotationDate: query.sort === "newest" ? "desc" : "asc" }, { quotationNumber: query.sort === "newest" ? "desc" : "asc" }],
      skip: (query.page - 1) * QUOTES_PAGE_SIZE,
      take: QUOTES_PAGE_SIZE,
      select: {
        id: true,
        quotationNumber: true,
        status: true,
        quotationDate: true,
        validUntil: true,
        total: true,
        currency: true,
        issuedAt: true,
        customer: { select: { name: true, ...customerFace } },
        lines: { orderBy: { createdAt: "asc" }, take: 1, select: { description: true } },
        crmLeadDocuments: { take: 1, select: { id: true, approval: { select: { firstViewedAt: true } } } },
        invoicesRaised: { take: 1, orderBy: { createdAt: "desc" }, select: { id: true, invoiceNumber: true, status: true } },
        supersededBy: { take: 1, orderBy: { createdAt: "desc" }, select: { quotationNumber: true } },
      },
    }),
    db.salesQuotation.count({ where }),
    db.salesQuotation.findMany({ where: { companyId, status: "SENT" }, select: { total: true, currency: true, validUntil: true, customer: { select: { name: true } } } }),
    db.customer.findMany({ where: { companyId, quotations: { some: {} } }, select: { id: true, name: true, ...customerFace }, orderBy: { name: "asc" }, take: 500 }),
    db.user.findMany({ where: { companyId, createdSalesQuotations: { some: { companyId } } }, select: { id: true, name: true, image: true }, orderBy: { name: "asc" }, take: 200 }),
    ...QUOTE_VIEWS.map((view) => db.salesQuotation.count({ where: quoteWhere(companyId, { ...query, view }, today) })),
  ]);
  const byCurrency = new Map<string, number>();
  for (const quote of sent) byCurrency.set(quote.currency, (byCurrency.get(quote.currency) ?? 0) + 1);
  const currency = [...byCurrency.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "USD";
  const live = sent.filter((quote) => quote.currency === currency);
  const out = Math.round(live.reduce((sum, quote) => sum + quote.total, 0) * 100) / 100;
  const soon = live
    .filter((quote) => quote.validUntil && storedDay(quote.validUntil) >= today)
    .sort((a, b) => storedDay(a.validUntil!).localeCompare(storedDay(b.validUntil!)))[0];
  // The totals row names one currency in the head, so it adds up the quotes written in it.
  const shown = new Map<string, number>();
  for (const record of records) shown.set(record.currency, (shown.get(record.currency) ?? 0) + 1);
  const headCurrency = [...shown.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? currency;
  const sum = await db.salesQuotation.aggregate({ where: { ...where, currency: headCurrency }, _sum: { total: true } });
  const rows: QuoteRow[] = records.map((record) => {
    const doc = record.crmLeadDocuments[0];
    return {
      id: record.id,
      number: record.quotationNumber,
      state: (Object.keys(QUOTE_STATUS) as QuoteTab[]).find((tab) => QUOTE_STATUS[tab] === record.status) ?? "draft",
      customer: record.customer.name,
      customerImage: customerImage(record.customer),
      forWhat: record.lines[0]?.description ?? "",
      validUntil: record.validUntil ? shortDay(storedDay(record.validUntil)) : null,
      validSoon: record.status === "SENT" && Boolean(record.validUntil) && daysBetween(today, storedDay(record.validUntil!)) <= 7,
      sent: record.status === "DRAFT" ? null : shortDay(record.issuedAt ? dayOf(record.issuedAt) : storedDay(record.quotationDate)),
      next: nextStep(record, today, now),
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
    currency: headCurrency,
    total: Math.round((sum._sum.total ?? 0) * 100) / 100,
    customers: customers.map((customer) => ({ id: customer.id, name: customer.name, image: customerImage(customer) })),
    reps,
    query,
  };
}
