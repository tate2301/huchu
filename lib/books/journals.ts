import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";

import { money, monthName, shortDay, storedDay } from "./format";

/**
 * Books → Ledger → Journals (design/core-modules/boards/view/BkJournals.html):
 * every journal by state, the drafts and the ones waiting for a second
 * person called out, and one journal's lines beside the list.
 */

export const JOURNAL_TABS = ["all", "draft", "to-approve", "posted", "reversed"] as const;
export type JournalTab = (typeof JOURNAL_TABS)[number];
export const JOURNAL_TAB_LABEL: Record<JournalTab, string> = { all: "All", draft: "Drafts", "to-approve": "To approve", posted: "Posted", reversed: "Reversed" };

export const JOURNAL_PERIODS = ["any", "this", "last-two", "year"] as const;
export type JournalPeriod = (typeof JOURNAL_PERIODS)[number];

export const JOURNAL_SORTS = ["needs", "newest", "oldest"] as const;
export type JournalSort = (typeof JOURNAL_SORTS)[number];
export const JOURNAL_SORT_LABEL: Record<JournalSort, string> = { needs: "Needs you first", newest: "Newest first", oldest: "Oldest first" };

/**
 * Each tab's filter. Reversed reads the markers the ledger writes, not a
 * status: a reversed or voided entry stays POSTED (its mirror cancels it), so
 * the REVERSED and VOIDED statuses are never written (books-final §6.1 fix
 * 10). Reversed: stamped `reversedAt` or `voidedAt`, or a void's own mirror
 * (`void:<id>`). Posted leaves those out. Drafts and To approve split the
 * DRAFT rows by whether a second person has been asked (`waiting`).
 */
const VOID_MIRROR: Prisma.JournalEntryWhereInput = { sourceId: { startsWith: "void:" } };
export function tabWhere(tab: Exclude<JournalTab, "all">, waiting: string[]): Prisma.JournalEntryWhereInput {
  switch (tab) {
    case "draft":
      return { status: "DRAFT", id: { notIn: waiting } };
    case "to-approve":
      return { status: "DRAFT", id: { in: waiting } };
    case "posted":
      return { status: "POSTED", reversedAt: null, voidedAt: null, NOT: VOID_MIRROR };
    case "reversed":
      return { OR: [{ reversedAt: { not: null } }, { voidedAt: { not: null } }, VOID_MIRROR] };
  }
}

export type JournalState = "draft" | "to-approve" | "posted" | "reversed" | "voided";
export const JOURNAL_STATE_WORD: Record<JournalState, string> = { draft: "Draft", "to-approve": "To approve", posted: "Posted", reversed: "Reversed", voided: "Void" };

/** A row's state, from the same markers. */
export function journalState(entry: { id?: string; status: string; reversedAt: Date | null; voidedAt: Date | null; sourceId: string | null }, waiting?: ReadonlySet<string>): JournalState {
  if (entry.status === "DRAFT") return entry.id && waiting?.has(entry.id) ? "to-approve" : "draft";
  if (entry.reversedAt) return "reversed";
  if (entry.voidedAt || entry.sourceId?.startsWith("void:")) return "voided";
  return "posted";
}

export const JOURNAL_PAGE_SIZE = 50;

export const journalQuerySchema = z.object({
  tab: z.enum(JOURNAL_TABS).catch("all"),
  q: z.string().trim().max(100).catch(""),
  sort: z.enum(JOURNAL_SORTS).catch("needs"),
  source: z.string().trim().max(60).catch(""),
  period: z.enum(JOURNAL_PERIODS).catch("any"),
  by: z.string().trim().max(60).catch(""),
  page: z.coerce.number().int().min(1).catch(1),
});
export type JournalQuery = z.infer<typeof journalQuerySchema>;

export type JournalRow = {
  id: string;
  /** "JE-0421", or null for a draft: it is given its number when it posts. */
  ref: string | null;
  /** "9 Oct". */
  date: string;
  memo: string;
  /** "Sales invoice", "Manual". */
  source: string;
  amount: number;
  state: JournalState;
  /** Who made it. */
  madeBy: { id: string; name: string; image: string | null };
  /** "Over $1,000: a second person posts it", "Reversed by JE-0433, 29 Sep", or where a document's journal came from. */
  note: string | null;
};

/** What this person may do with journals, from the one matrix (`canDo`): the page draws only these. */
export type JournalCan = { create: boolean; post: boolean; deleteDraft: boolean; reverse: boolean };

export type JournalsView = {
  finding: { fact: string; rest: string | null };
  counts: Record<JournalTab, number>;
  rows: JournalRow[];
  range: { from: number; to: number; of: number };
  /** The Period chip's choices, with "Oct" and "Sep, Oct" named from today. */
  periods: Array<{ value: JournalPeriod; label: string }>;
  periodLabel: string;
  /** Everyone who has made a journal, for Made by. */
  makers: Array<{ id: string; name: string; image: string | null }>;
  can: JournalCan;
  /** The sources the Source chip offers: the ones this workspace has journals from. */
  sources: Array<{ value: string; label: string }>;
  currency: string;
  query: JournalQuery;
};

export type JournalDetail = {
  id: string;
  ref: string | null;
  state: JournalState;
  memo: string;
  /** "30 Sep 2026 · September · Manual". */
  meta: string;
  manual: boolean;
  lines: Array<{ code: string; account: string; costCentre: string | null; debit: number; credit: number; memo: string | null }>;
  totals: { debit: number; credit: number };
  /** Typed in another currency: "ZWG at 27.00". */
  currencyNote: string | null;
  attachment: { url: string; name: string } | null;
  /** Who sent it for approval, when it waits. */
  waitingFor: string | null;
  /** What posting it takes: "September is open, so this can post without a reason." */
  periodNote: string | null;
  /** The period is closed: posting needs a reason. */
  needsReason: boolean;
  /** "Reversed by JE-0433", "Reverses JE-0420". */
  link: string | null;
};

/** "JE-0421"; a draft's placeholder (zero or below) has no number. */
export const journalRef = (entryNumber: number) => (entryNumber > 0 ? `JE-${String(entryNumber).padStart(4, "0")}` : "No number yet");
const refOrNull = (entryNumber: number) => (entryNumber > 0 ? journalRef(entryNumber) : null);

const SOURCE_WORD: Record<string, string> = {
  MANUAL: "Manual",
  SALES_INVOICE: "Invoice",
  SALES_RECEIPT: "Payment received",
  SALES_CREDIT_NOTE: "Credit note",
  SALES_WRITE_OFF: "Write-off",
  PURCHASE_BILL: "Bill",
  PURCHASE_PAYMENT: "Payment made",
  PURCHASE_DEBIT_NOTE: "Debit note",
  PURCHASE_WRITE_OFF: "Write-off",
  BANK_TRANSACTION: "Bank",
  PAYROLL_RUN: "Payroll",
  PAYROLL_DISBURSEMENT: "Payroll paid",
  RETAIL_SALE: "Till sale",
  RETAIL_DAY_BANKED: "Takings",
  RETAIL_SHIFT_CLOSE: "Takings",
  CRM_REQUISITION_DISBURSEMENT: "Requisition",
  CRM_REQUISITION_REFUND: "Requisition",
  REQUISITION_ACQUITTAL: "Requisition",
  EXPENSE_CLAIM_PAYMENT: "Claim",
  PETTY_CASH_VOUCHER: "Petty cash",
};

/** SALES_INVOICE → "Invoice"; an unnamed one in plain words: STOCK_ISSUE → "Stock issue". */
export function sourceLabel(sourceType: string): string {
  if (SOURCE_WORD[sourceType]) return SOURCE_WORD[sourceType];
  const text = sourceType.toLowerCase().split("_").join(" ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/**
 * "2 September journals are still drafts. 1 more waits for a second person."
 * One month names it; several say "journals". Pure.
 */
export function journalsFinding(drafts: Array<{ month: string }>, waiting = 0): { fact: string; rest: string | null } {
  if (drafts.length === 0 && waiting === 0) return { fact: "Every journal is posted.", rest: null };
  const months = [...new Set(drafts.map((draft) => draft.month))];
  const waits = waiting ? `${waiting} ${drafts.length ? "more " : ""}${plural(waiting, "waits", "wait")} for a second person.` : null;
  if (drafts.length === 0) return { fact: `${waiting} ${plural(waiting, "journal waits", "journals wait")} for a second person.`, rest: null };
  const which = months.length === 1 ? `${months[0]} ${plural(drafts.length, "journal", "journals")}` : plural(drafts.length, "journal", "journals");
  const fact = `${drafts.length} ${which} ${plural(drafts.length, "is still a draft.", "are still drafts.")}`;
  return { fact, rest: waits };
}

type Db = Pick<PrismaClient, "journalEntry" | "approvalAction" | "accountingSettings" | "retailApprovalSettings" | "user">;

/** The drafts waiting for a second person: each one's last MANUAL_JOURNAL approval row is a SUBMIT. */
async function waitingIds(db: Db, companyId: string): Promise<string[]> {
  const rows = await db.approvalAction.findMany({ where: { companyId, entityType: "MANUAL_JOURNAL" }, select: { entityId: true, action: true }, orderBy: { actedAt: "asc" } });
  const last = new Map<string, string>();
  for (const row of rows) last.set(row.entityId, row.action);
  return [...last].filter(([, action]) => action === "SUBMIT").map(([id]) => id);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The days a Period covers, as stored (UTC midnights), or none for Any. */
function periodRange(period: JournalPeriod, today: string, fyStartMonth: number): { gte: Date; lt: Date } | null {
  if (period === "any") return null;
  const [y, m] = today.split("-").map(Number) as [number, number];
  const start = period === "this" ? Date.UTC(y, m - 1, 1) : period === "last-two" ? Date.UTC(y, m - 2, 1) : Date.UTC(m >= fyStartMonth ? y : y - 1, fyStartMonth - 1, 1);
  return { gte: new Date(start), lt: new Date(Date.UTC(y, m, 1)) };
}

/** "Oct", "Sep, Oct": the months a Period names. */
function periodWord(period: JournalPeriod, today: string): string {
  const [y, m] = today.split("-").map(Number) as [number, number];
  if (period === "any") return "Any";
  if (period === "this") return MONTHS[m - 1]!;
  if (period === "last-two") return `${MONTHS[(m + 10) % 12]}, ${MONTHS[m - 1]}`;
  return "This year";
}

/** What every count and list shares: this workspace, the period and who made it. */
function base(companyId: string, query: JournalQuery, today: string, fyStartMonth: number): Prisma.JournalEntryWhereInput[] {
  const range = periodRange(query.period, today, fyStartMonth);
  return [{ companyId }, ...(range ? [{ entryDate: range }] : []), ...(query.by ? [{ createdById: query.by }] : [])];
}

function where(companyId: string, query: JournalQuery, waiting: string[], today: string, fyStartMonth: number): Prisma.JournalEntryWhereInput {
  const parts: Prisma.JournalEntryWhereInput[] = base(companyId, query, today, fyStartMonth);
  if (query.tab !== "all") parts.push(tabWhere(query.tab, waiting));
  if (query.source) parts.push({ sourceType: query.source as never });
  if (query.q) {
    const number = Number(query.q.replace(/^je-?/i, ""));
    parts.push({
      OR: [{ description: { contains: query.q, mode: "insensitive" } }, ...(Number.isInteger(number) && number > 0 ? [{ entryNumber: number }] : [])],
    });
  }
  return { AND: parts };
}

const amountOf = (lines: Array<{ debit: number; credit: number }>) => {
  const debit = lines.reduce((sum, line) => sum + line.debit, 0);
  const credit = lines.reduce((sum, line) => sum + line.credit, 0);
  return Math.round(Math.max(debit, credit) * 100) / 100;
};

const SELECT = {
  id: true,
  entryNumber: true,
  entryDate: true,
  description: true,
  sourceType: true,
  sourceId: true,
  status: true,
  reversedAt: true,
  voidedAt: true,
  createdBy: { select: { id: true, name: true, image: true } },
  reversalEntry: { select: { entryNumber: true, entryDate: true } },
  reversalOfEntry: { select: { entryNumber: true } },
  lines: { select: { debit: true, credit: true } },
} as const;

type Record_ = Prisma.JournalEntryGetPayload<{ select: typeof SELECT }>;

/** The Note column: what a second person waits on, what reversed it, or where a document's journal came from. */
function noteOf(record: Record_, state: JournalState, limit: number, currency: string): string | null {
  if (state === "to-approve") return limit > 0 ? `Over ${money(limit, currency)}: a second person posts it` : null;
  if (record.reversalEntry) return `Reversed by ${journalRef(record.reversalEntry.entryNumber)}, ${shortDay(storedDay(record.reversalEntry.entryDate))}`;
  if (record.reversalOfEntry) return `Reverses ${journalRef(record.reversalOfEntry.entryNumber)}`;
  return record.sourceType === "MANUAL" ? null : sourceLabel(record.sourceType);
}

export async function readJournals(db: Db, companyId: string, query: JournalQuery, can: JournalCan, now = new Date()): Promise<JournalsView> {
  const today = now.toISOString().slice(0, 10);
  const settings0 = await db.accountingSettings.findUnique({ where: { companyId }, select: { fiscalYearStartMonth: true } });
  const fy = settings0?.fiscalYearStartMonth ?? 1;
  const waiting = await waitingIds(db, companyId);
  const waitingSet = new Set(waiting);
  const filter = where(companyId, query, waiting, today, fy);
  const counted = (tab: Exclude<JournalTab, "all">) => db.journalEntry.count({ where: { AND: [...base(companyId, query, today, fy), tabWhere(tab, waiting)] } });
  // "Needs you first": waiting, then drafts, then the rest newest first. The
  // DRAFT rows are few, so they are read whole and the posted ones paged after them.
  const order: Prisma.JournalEntryOrderByWithRelationInput[] = query.sort === "oldest" ? [{ entryDate: "asc" }, { entryNumber: "asc" }] : [{ entryDate: "desc" }, { entryNumber: "desc" }];
  const [matching, all, draft, toApprove, posted, reversed, drafts, settings, sourceGroups, makerGroups, limits] = await Promise.all([
    db.journalEntry.count({ where: filter }),
    db.journalEntry.count({ where: { AND: base(companyId, query, today, fy) } }),
    counted("draft"),
    counted("to-approve"),
    counted("posted"),
    counted("reversed"),
    db.journalEntry.findMany({ where: { companyId, status: "DRAFT" }, select: { id: true, entryDate: true }, orderBy: { entryDate: "asc" } }),
    db.accountingSettings.findUnique({ where: { companyId }, select: { baseCurrency: true } }),
    db.journalEntry.groupBy({ by: ["sourceType"], where: { companyId }, _count: { _all: true } }),
    db.journalEntry.groupBy({ by: ["createdById"], where: { companyId }, _count: { _all: true } }),
    db.retailApprovalSettings.findUnique({ where: { companyId }, select: { journalSecondOver: true } }),
  ]);
  const makers = makerGroups.length ? await db.user.findMany({ where: { id: { in: makerGroups.map((group) => group.createdById) } }, select: { id: true, name: true, image: true }, orderBy: { name: "asc" } }) : [];
  const limit = limits ? Number(limits.journalSecondOver) : 1000;
  let records: Record_[];
  const skip = (query.page - 1) * JOURNAL_PAGE_SIZE;
  if (query.sort === "needs") {
    const first = await db.journalEntry.findMany({ where: { AND: [filter, { status: "DRAFT" }] }, select: SELECT, orderBy: order });
    first.sort((a, b) => Number(waitingSet.has(b.id)) - Number(waitingSet.has(a.id)));
    const head = first.slice(skip, skip + JOURNAL_PAGE_SIZE);
    const rest = head.length < JOURNAL_PAGE_SIZE
      ? await db.journalEntry.findMany({ where: { AND: [filter, { status: { not: "DRAFT" } }] }, select: SELECT, orderBy: order, skip: Math.max(0, skip - first.length), take: JOURNAL_PAGE_SIZE - head.length })
      : [];
    records = [...head, ...rest];
  } else {
    records = await db.journalEntry.findMany({ where: filter, select: SELECT, orderBy: order, skip, take: JOURNAL_PAGE_SIZE });
  }
  const counts: Record<JournalTab, number> = { all, draft, "to-approve": toApprove, posted, reversed };
  const from = matching === 0 ? 0 : skip + 1;
  const plainDrafts = drafts.filter((row) => !waitingSet.has(row.id));
  const waitingRows = drafts.filter((row) => waitingSet.has(row.id));
  const currency = settings?.baseCurrency ?? "USD";
  return {
    finding: journalsFinding(plainDrafts.map((row) => ({ month: monthName(storedDay(row.entryDate)) })), waitingRows.length),
    counts,
    rows: records.map((record) => {
      const state = journalState(record, waitingSet);
      return {
        id: record.id,
        ref: refOrNull(record.entryNumber),
        date: shortDay(storedDay(record.entryDate)),
        memo: record.description,
        source: sourceLabel(record.sourceType),
        amount: amountOf(record.lines),
        state,
        madeBy: { id: record.createdBy.id, name: record.createdBy.name, image: record.createdBy.image ?? null },
        note: noteOf(record, state, limit, currency),
      };
    }),
    range: { from, to: from === 0 ? 0 : from + records.length - 1, of: matching },
    periods: JOURNAL_PERIODS.map((value) => ({ value, label: periodWord(value, today) })),
    periodLabel: periodWord(query.period, today),
    makers: makers.map((user) => ({ id: user.id, name: user.name, image: user.image ?? null })),
    can,
    sources: sourceGroups
      .map((group) => ({ value: group.sourceType as string, label: sourceLabel(group.sourceType) }))
      .sort((a, b) => (a.value === "MANUAL" ? -1 : b.value === "MANUAL" ? 1 : a.label.localeCompare(b.label))),
    currency,
    query,
  };
}

type DetailDb = Db & Pick<PrismaClient, "retailAttachment" | "user">;

export async function readJournal(db: DetailDb, companyId: string, id: string): Promise<JournalDetail | null> {
  const entry = await db.journalEntry.findFirst({
    where: { id, companyId },
    select: {
      id: true,
      entryNumber: true,
      entryDate: true,
      description: true,
      status: true,
      sourceType: true,
      sourceId: true,
      reversedAt: true,
      voidedAt: true,
      period: { select: { startDate: true, status: true } },
      reversalOfEntry: { select: { entryNumber: true } },
      reversalEntry: { select: { entryNumber: true } },
      lines: {
        select: { debit: true, credit: true, memo: true, currency: true, exchangeRate: true, account: { select: { code: true, name: true } }, costCenter: { select: { name: true } } },
        orderBy: [{ debit: "desc" }, { createdAt: "asc" }],
      },
    },
  });
  if (!entry) return null;
  const [waiting, attachment] = await Promise.all([
    db.approvalAction.findFirst({ where: { companyId, entityType: "MANUAL_JOURNAL", entityId: id }, orderBy: { actedAt: "desc" }, select: { action: true, actedById: true } }),
    db.retailAttachment.findFirst({ where: { companyId, entityType: "JournalEntry", entityId: id }, select: { url: true, name: true } }),
  ]);
  const isWaiting = entry.status === "DRAFT" && waiting?.action === "SUBMIT";
  const sender = isWaiting && waiting ? await db.user.findUnique({ where: { id: waiting.actedById }, select: { name: true } }) : null;
  const day = storedDay(entry.entryDate);
  const date = new Date(`${day}T00:00:00Z`);
  const month = monthName(day);
  const closed = entry.period?.status === "CLOSED";
  const round = (n: number) => Math.round(n * 100) / 100;
  const foreign = entry.lines.find((line) => line.currency && line.exchangeRate);
  return {
    id: entry.id,
    ref: refOrNull(entry.entryNumber),
    state: journalState(entry, isWaiting ? new Set([entry.id]) : undefined),
    memo: entry.description,
    meta: [`${date.getUTCDate()} ${shortDay(day).split(" ")[1]} ${date.getUTCFullYear()}`, entry.period ? monthName(storedDay(entry.period.startDate)) : null, sourceLabel(entry.sourceType)].filter(Boolean).join(" · "),
    manual: entry.sourceType === "MANUAL",
    lines: entry.lines.map((line) => ({ code: line.account.code, account: line.account.name, costCentre: line.costCenter?.name ?? null, debit: line.debit, credit: line.credit, memo: line.memo })),
    totals: {
      debit: round(entry.lines.reduce((sum, line) => sum + line.debit, 0)),
      credit: round(entry.lines.reduce((sum, line) => sum + line.credit, 0)),
    },
    currencyNote: foreign ? `Typed in ${foreign.currency} at ${foreign.exchangeRate!.toFixed(2)}` : null,
    attachment: attachment ? { url: attachment.url, name: attachment.name } : null,
    waitingFor: isWaiting ? `Sent by ${sender?.name ?? "a colleague"} for a second person` : null,
    periodNote: entry.status !== "DRAFT" ? null : closed ? `${month} is closed, so posting this needs a reason.` : `${month} is open, so this can post without a reason.`,
    needsReason: entry.status === "DRAFT" && closed,
    link: entry.reversalEntry ? `Reversed by ${journalRef(entry.reversalEntry.entryNumber)}` : entry.reversalOfEntry ? `Reverses ${journalRef(entry.reversalOfEntry.entryNumber)}` : null,
  };
}

/** The list as it is filtered, every page, for Export. */
export async function journalsCsv(db: Db, companyId: string, query: JournalQuery, now = new Date()): Promise<string> {
  const waiting = await waitingIds(db, companyId);
  const waitingSet = new Set(waiting);
  const settings = await db.accountingSettings.findUnique({ where: { companyId }, select: { fiscalYearStartMonth: true } });
  const records = await db.journalEntry.findMany({ where: where(companyId, query, waiting, now.toISOString().slice(0, 10), settings?.fiscalYearStartMonth ?? 1), select: SELECT, orderBy: [{ entryDate: "desc" }, { entryNumber: "desc" }], take: 10_000 });
  const cell = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  const lines = ["Number,Date,Memo,Source,Amount,State"];
  for (const record of records) {
    lines.push([journalRef(record.entryNumber), storedDay(record.entryDate), record.description, sourceLabel(record.sourceType), amountOf(record.lines).toFixed(2), JOURNAL_STATE_WORD[journalState(record, waitingSet)]].map(cell).join(","));
  }
  return `${lines.join("\n")}\n`;
}

export type JournalFormOptions = {
  accounts: Array<{ id: string; label: string }>;
  costCentres: Array<{ id: string; label: string }>;
  currencies: string[];
  baseCurrency: string;
  /** Over this (base currency), a second person approves it; 0 when nobody has to. */
  secondOver: number;
};

/** What New journal chooses from: the active ledger accounts, the cost centres, the currencies with a rate, the limit. */
export async function readJournalForm(db: Pick<PrismaClient, "chartOfAccount" | "costCenter" | "currencyRate" | "accountingSettings" | "retailApprovalSettings">, companyId: string): Promise<JournalFormOptions> {
  const [accounts, centres, rates, settings, limits] = await Promise.all([
    db.chartOfAccount.findMany({ where: { companyId, isActive: true, nodeType: "LEDGER" }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }),
    db.costCenter.findMany({ where: { companyId, isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.currencyRate.findMany({ where: { companyId }, distinct: ["quoteCurrency"], select: { quoteCurrency: true } }),
    db.accountingSettings.findUnique({ where: { companyId }, select: { baseCurrency: true } }),
    db.retailApprovalSettings.findUnique({ where: { companyId }, select: { journalSecondOver: true } }),
  ]);
  const base = settings?.baseCurrency ?? "USD";
  return {
    accounts: accounts.map((account) => ({ id: account.id, label: `${account.code} ${account.name}` })),
    costCentres: centres.map((centre) => ({ id: centre.id, label: centre.name })),
    currencies: [base, ...rates.map((rate) => rate.quoteCurrency).filter((code) => code !== base).sort()],
    baseCurrency: base,
    secondOver: limits ? Number(limits.journalSecondOver) : 1000,
  };
}
