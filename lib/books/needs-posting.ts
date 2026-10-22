import type { AccountingSourceType, Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";

import { ACCOUNTING_SOURCE_TYPE_OPTIONS as SOURCE_TYPE_OPTIONS } from "@/lib/accounting/source-types";
import { RETAIL_SOURCE_TYPES } from "@/lib/retail/posting-settings";

import { isHeld } from "./core/holds";
import { asOf, count, dayOf, monthName, storedDay } from "./format";

/**
 * Close the month → Needs posting (design/core-modules/boards/view/BkNeedsPosting.html):
 * every money event that has not reached the ledger. Failed is every FAILED
 * event, held ones (dated in a closed month) among them; Waiting is PENDING
 * for more than an hour, except a shop's retail events booked for its day's
 * run. Each row says what the document is, why it did not post in plain
 * words, and what fixes it: Retry, map the missing account, add a rule, or
 * post it in this month.
 */

export const NEEDS_POSTING_TABS = ["failed", "waiting"] as const;
export type NeedsPostingTab = (typeof NEEDS_POSTING_TABS)[number];

export const needsPostingQuerySchema = z.object({
  tab: z.enum(NEEDS_POSTING_TABS).catch("failed"),
  q: z.string().trim().max(100).catch(""),
  source: z.string().trim().max(60).catch(""),
});
export type NeedsPostingQuery = z.infer<typeof needsPostingQuerySchema>;

/** Waiting this long, an event needs a look (books-final §1.1 rule 5). */
export const WAITING_AFTER_MS = 60 * 60_000;

/** What would let it post. */
export type NeedsPostingFix =
  | { kind: "map"; target: "event" | "role" | "tender"; key: string; label: string }
  | { kind: "rule"; label: string; href: string }
  | { kind: "month"; month: string }
  | null;

export type NeedsPostingRow = {
  id: string;
  sourceType: string;
  /** "GRN-0045", when the document has a number. */
  ref: string | null;
  /** "Tile Trader Zimbabwe": who or what, beside the number. */
  title: string;
  /** "Goods received, skirting and trims". */
  sub: string | null;
  href: string | null;
  /** "16 Oct 14:20". */
  since: string;
  amount: number | null;
  currency: string;
  /** In plain words: "No stock account for skirting and trims". */
  why: string;
  fix: NeedsPostingFix;
  held: boolean;
  tries: { first: string; last: string; count: number; next: string };
};

export type NeedsPostingView = {
  finding: { fact: string; rest: string | null };
  counts: Record<NeedsPostingTab, number>;
  rows: NeedsPostingRow[];
  /** The source types present, for the Source filter. */
  sources: Array<{ value: string; label: string }>;
  total: { amount: number; currency: string } | null;
  /** The month the waiting money holds up: "October". */
  heldUp: string | null;
  query: NeedsPostingQuery;
};

type Db = Pick<
  PrismaClient,
  "accountingIntegrationEvent" | "salesInvoice" | "salesReceipt" | "purchaseBill" | "crmRequisition" | "crmDailyCostEntry" | "retailGoodsReceipt" | "accountingPeriod"
>;

const LABEL = new Map(SOURCE_TYPE_OPTIONS.map((option) => [option.value as string, option.label]));

/** CRM_REQUISITION_DISBURSEMENT → "Requisition paid out": the source in a person's words. */
export function sourceWords(sourceType: string): string {
  const own: Record<string, string> = {
    CRM_REQUISITION_DISBURSEMENT: "Requisition paid out",
    CRM_REQUISITION_REFUND: "Requisition change returned",
    CRM_REQUISITION_TOPUP: "Requisition overspend",
    CRM_COST_ENTRY_SPEND: "Cost tracker spend",
    CRM_COST_ENTRY_RECEIPT: "Cash received in the cost tracker",
    RETAIL_GOODS_RECEIPT: "Goods received",
    MAINTENANCE_COMPLETION: "Maintenance completed",
  };
  if (own[sourceType]) return own[sourceType];
  const label = LABEL.get(sourceType);
  if (label) return label.charAt(0) + label.slice(1).toLowerCase();
  const words = sourceType.toLowerCase().split("_").join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const lower = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

/** Why it did not post, in plain words, and what would let it. */
export function explain(event: { status: string; lastError: string | null; nextRetryAt: Date | null; sourceType: string }): { why: string; fix: NeedsPostingFix } {
  const error = (event.lastError ?? "").trim();
  if (isHeld(event.nextRetryAt)) {
    const month = /^(\w+ \d{4}) is closed/.exec(error)?.[1] ?? null;
    return { why: month ? `${month} is closed` : "The books are frozen for its date", fix: { kind: "month", month: month ?? "" } };
  }
  if (!error) return { why: event.status === "PENDING" ? "Not tried yet" : "It did not post", fix: null };
  let match = /^The event names no (\w+) to post to/.exec(error);
  if (match) {
    const key = match[1];
    const word = key === "moneyAccount" ? "money account" : key === "expenseAccount" ? "expense account" : key === "changeAccount" ? "account for change" : "account";
    return { why: `No ${word} to post it to`, fix: { kind: "map", target: "event", key, label: `${word.charAt(0).toUpperCase()}${word.slice(1)} for ${lower(sourceWords(event.sourceType))}` } };
  }
  match = /^No account is set for (.+)$/.exec(error);
  if (match) return { why: `No ${match[1]} account`, fix: { kind: "map", target: "role", key: match[1], label: `${match[1].charAt(0).toUpperCase()}${match[1].slice(1)} account` } };
  match = /^Tender mapping missing for (\S+)/.exec(error);
  if (match) {
    const tender = match[1].toLowerCase().replace(/_/g, " ");
    return { why: `No account for ${tender} payments`, fix: { kind: "map", target: "tender", key: match[1], label: `Account for ${tender} payments` } };
  }
  if (/^Posting rule missing/.test(error)) {
    return { why: `No rule says where ${lower(sourceWords(event.sourceType))} posts`, fix: { kind: "rule", label: "Add a rule", href: "/books/posting-rules" } };
  }
  if (/inactive or non-ledger accounts/.test(error)) {
    return { why: "Its rule posts to an account that is closed or is a heading", fix: { kind: "rule", label: "Fix the rule", href: "/books/posting-rules" } };
  }
  match = /^Unbalanced entry \(debit ([\d.]+) vs credit ([\d.]+)\)/.exec(error);
  if (match) return { why: `Its rule doesn’t balance: ${match[1]} against ${match[2]}`, fix: { kind: "rule", label: "Fix the rule", href: "/books/posting-rules" } };
  if (/period is closed|strict lock|Only managers can override|Override reason is required|frozen through/i.test(error)) {
    return { why: "Its month is closed", fix: null };
  }
  if (/Nobody in the company to post as/.test(error)) return { why: "Nobody in the workspace to post it as", fix: null };
  return { why: error.length > 80 ? `${error.slice(0, 79)}…` : error, fix: null };
}

/** The filter for a tab, with the hour a waiting event is given. */
export function tabWhere(companyId: string, tab: NeedsPostingTab, now: Date): Prisma.AccountingIntegrationEventWhereInput {
  const base: Prisma.AccountingIntegrationEventWhereInput = { companyId, sourceType: { not: null }, sourceId: { not: null } };
  if (tab === "failed") return { ...base, status: "FAILED" };
  return {
    ...base,
    status: "PENDING",
    createdAt: { lte: new Date(now.getTime() - WAITING_AFTER_MS) },
    // A shop's sales booked for its day's run are on time, not stuck.
    NOT: { attemptCount: 0, nextRetryAt: { gt: now }, sourceType: { in: RETAIL_SOURCE_TYPES } },
  };
}

/** What blocks a month's close: every FAILED event, and PENDING for over an hour (books-final §1.1 rule 5). */
export function blockingWhere(companyId: string, now: Date, range?: { gte: Date; lte: Date }): Prisma.AccountingIntegrationEventWhereInput {
  const dated = range ? { OR: [{ entryDate: range }, { entryDate: null, createdAt: range }] } : {};
  return { OR: [tabWhere(companyId, "failed", now), tabWhere(companyId, "waiting", now)], ...dated };
}

type EventRow = {
  id: string;
  sourceType: AccountingSourceType | null;
  sourceId: string | null;
  status: string;
  description: string | null;
  amount: number | null;
  currency: string | null;
  entryDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
  attemptCount: number;
  nextRetryAt: Date | null;
  lastError: string | null;
};

type Doc = { ref: string | null; title: string; sub: string | null; href: string | null };

/** The documents behind the events, one query per kind. */
async function documents(db: Db, companyId: string, events: EventRow[]): Promise<Map<string, Doc>> {
  const ids = (prefix: string | string[]) =>
    events
      .filter((event) => event.sourceType && (Array.isArray(prefix) ? prefix.includes(event.sourceType) : event.sourceType.startsWith(prefix)))
      .map((event) => (event.sourceId ?? "").replace(/^void:/, "").split(":")[0]!)
      .filter(Boolean);
  const out = new Map<string, Doc>();
  const [invoices, receipts, bills, requisitions, costs, deliveries] = await Promise.all([
    ids(["SALES_INVOICE"]).length
      ? db.salesInvoice.findMany({ where: { companyId, id: { in: ids(["SALES_INVOICE"]) } }, select: { id: true, invoiceNumber: true, customer: { select: { name: true } } } })
      : [],
    ids(["SALES_RECEIPT"]).length
      ? db.salesReceipt.findMany({ where: { companyId, id: { in: ids(["SALES_RECEIPT"]) } }, select: { id: true, receiptNumber: true, method: true } })
      : [],
    ids(["PURCHASE_BILL"]).length
      ? db.purchaseBill.findMany({ where: { companyId, id: { in: ids(["PURCHASE_BILL"]) } }, select: { id: true, billNumber: true, vendor: { select: { name: true } } } })
      : [],
    ids("CRM_REQUISITION_").length
      ? db.crmRequisition.findMany({ where: { companyId, id: { in: ids("CRM_REQUISITION_") } }, select: { id: true, requisitionNo: true, purpose: true } })
      : [],
    ids("CRM_COST_ENTRY_").length
      ? db.crmDailyCostEntry.findMany({ where: { companyId, id: { in: ids("CRM_COST_ENTRY_") } }, select: { id: true, description: true } })
      : [],
    ids(["RETAIL_GOODS_RECEIPT"]).length
      ? db.retailGoodsReceipt.findMany({ where: { companyId, id: { in: ids(["RETAIL_GOODS_RECEIPT"]) } }, select: { id: true, receiptNo: true, vendor: { select: { name: true } } } })
      : [],
  ]);
  for (const row of invoices) out.set(row.id, { ref: row.invoiceNumber, title: row.customer?.name ?? "Invoice", sub: "Sales invoice", href: `/books/invoices/${row.id}` });
  for (const row of receipts) out.set(row.id, { ref: row.receiptNumber, title: "Payment received", sub: null, href: `/books/payments?payment=${row.id}` });
  for (const row of bills) out.set(row.id, { ref: row.billNumber, title: row.vendor?.name ?? "Bill", sub: "Supplier bill", href: null });
  for (const row of requisitions) out.set(row.id, { ref: row.requisitionNo, title: row.purpose, sub: null, href: `/crm/requisitions/${row.id}` });
  for (const row of costs) out.set(row.id, { ref: null, title: row.description, sub: null, href: "/crm/cost-tracker" });
  for (const row of deliveries) out.set(row.id, { ref: row.receiptNo, title: row.vendor?.name ?? "Delivery", sub: null, href: null });
  return out;
}

const time = (value: Date, now: Date) => asOf(value, now);

export function rowOf(event: EventRow, doc: Doc | undefined, now: Date): NeedsPostingRow {
  const sourceType = event.sourceType ?? "MANUAL";
  const { why, fix } = explain({ status: event.status, lastError: event.lastError, nextRetryAt: event.nextRetryAt, sourceType });
  const held = isHeld(event.nextRetryAt);
  const subWords = sourceWords(sourceType);
  return {
    id: event.id,
    sourceType,
    ref: doc?.ref ?? null,
    title: doc?.title ?? event.description ?? subWords,
    sub: doc ? (doc.sub && doc.sub !== subWords ? `${doc.sub}, ${lower(subWords)}` : subWords) : event.description ? subWords : null,
    href: doc?.href ?? null,
    since: time(event.createdAt, now),
    amount: event.amount ?? null,
    currency: event.currency ?? "USD",
    why,
    fix,
    held,
    tries: {
      first: time(event.createdAt, now),
      last: event.attemptCount > 0 ? time(event.updatedAt, now) : "Not yet",
      count: event.attemptCount,
      next: held ? "When you choose" : event.nextRetryAt && event.nextRetryAt > now ? time(event.nextRetryAt, now) : "Next run",
    },
  };
}

function matches(row: NeedsPostingRow, q: string) {
  if (!q) return true;
  const needle = q.toLowerCase();
  return [row.ref, row.title, row.sub, row.why].some((text) => (text ?? "").toLowerCase().includes(needle));
}

export function needsPostingFinding(failed: number, waiting: number, heldUp: string | null): { fact: string; rest: string | null } {
  const all = failed + waiting;
  if (all === 0) return { fact: "Every money event reached the ledger.", rest: null };
  const fact = `${count(all, "money event")} didn’t reach the ledger.`;
  return { fact, rest: heldUp ? `${all === 1 ? "It holds" : "They hold"} up ${heldUp}’s close.` : null };
}

export async function readNeedsPosting(db: Db, companyId: string, query: NeedsPostingQuery, now = new Date()): Promise<NeedsPostingView> {
  const select = {
    id: true,
    sourceType: true,
    sourceId: true,
    status: true,
    description: true,
    amount: true,
    currency: true,
    entryDate: true,
    createdAt: true,
    updatedAt: true,
    attemptCount: true,
    nextRetryAt: true,
    lastError: true,
  } as const;
  const [failed, waiting, periods] = await Promise.all([
    db.accountingIntegrationEvent.findMany({ where: tabWhere(companyId, "failed", now), select, orderBy: { createdAt: "asc" }, take: 500 }),
    db.accountingIntegrationEvent.findMany({ where: tabWhere(companyId, "waiting", now), select, orderBy: { createdAt: "asc" }, take: 500 }),
    db.accountingPeriod.findMany({ where: { companyId, status: "OPEN" }, select: { startDate: true, endDate: true }, orderBy: { startDate: "asc" } }),
  ]);
  const shown = query.tab === "failed" ? failed : waiting;
  const docs = await documents(db, companyId, shown);
  const all = shown.map((event) => rowOf(event, docs.get((event.sourceId ?? "").replace(/^void:/, "").split(":")[0]!), now));
  const rows = all.filter((row) => (!query.source || row.sourceType === query.source) && matches(row, query.q));

  // The month it holds up: the earliest open month any of it is dated in.
  const dates = [...failed, ...waiting].filter((event) => !isHeld(event.nextRetryAt)).map((event) => storedDay(event.entryDate ?? event.createdAt));
  const today = dayOf(now);
  const open = periods.map((period) => ({ from: storedDay(period.startDate), to: storedDay(period.endDate) }));
  const earliest = dates.sort()[0];
  const heldUp = earliest ? (open.some((period) => period.from <= earliest && earliest <= period.to) || earliest <= today ? monthName(earliest) : null) : null;

  const currencies = new Set(rows.filter((row) => row.amount !== null).map((row) => row.currency));
  const total = rows.length && currencies.size === 1 ? { amount: Math.round(rows.reduce((sum, row) => sum + (row.amount ?? 0), 0) * 100) / 100, currency: [...currencies][0]! } : null;

  return {
    finding: needsPostingFinding(failed.length, waiting.length, heldUp),
    counts: { failed: failed.length, waiting: waiting.length },
    rows,
    sources: [...new Set(all.map((row) => row.sourceType))].sort().map((value) => ({ value, label: sourceWords(value) })),
    total,
    heldUp,
    query,
  };
}

export function needsPostingCsv(view: NeedsPostingView): string {
  const cell = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  const lines = ["Document,Source,Since,Amount,Currency,Why it didn't post,Tries"];
  for (const row of view.rows) {
    lines.push([[row.ref, row.title].filter(Boolean).join(" "), sourceWords(row.sourceType), row.since, row.amount === null ? "" : row.amount.toFixed(2), row.currency, row.why, String(row.tries.count)].map(cell).join(","));
  }
  return `${lines.join("\n")}\n`;
}
