import type { PrismaClient } from "@prisma/client";

import { getAccountingSetupReadiness } from "@/lib/accounting/bootstrap";
import { ID_ENTITY_CONFIG, type ReservableIdEntity } from "@/lib/id-generator";

import { seriesPrefixes, SERIES, type NumberedDocument } from "./core/numbering";
import { provisionalTax } from "./core/tax-calendar";
import { taxSettings } from "./core/tax-settings";
import { dayOf, money, shortDay, storedDay } from "./format";

/**
 * Books → Settings (Numbering, Locks & periods, Opening balances, Set up the
 * books) and Close the month → Year end, read and shaped for their pages.
 */

type Db = PrismaClient;
const round2 = (n: number) => Math.round(n * 100) / 100;
const dayYear = (iso: string) => `${shortDay(iso)} ${iso.slice(0, 4)}`;
const WEEKDAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/* ── Numbering ───────────────────────────────────────────────────────── */

type Latest = { number: string | null; date: Date | null } | null;

/** Each series: its words, and where its last issued number is read from. */
const NUMBERED: Array<{ type: NumberedDocument; label: string; latest: (db: Db, companyId: string, prefix: string) => Promise<Latest> }> = [
  { type: "invoice", label: "Invoice", latest: (db, companyId, prefix) => db.salesInvoice.findFirst({ where: { companyId, invoiceNumber: { startsWith: prefix } }, orderBy: { invoiceNumber: "desc" }, select: { invoiceNumber: true, invoiceDate: true } }).then((row) => row && { number: row.invoiceNumber, date: row.invoiceDate }) },
  { type: "credit-note", label: "Credit note", latest: (db, companyId, prefix) => db.creditNote.findFirst({ where: { companyId, noteNumber: { startsWith: prefix } }, orderBy: { noteNumber: "desc" }, select: { noteNumber: true, noteDate: true } }).then((row) => row && { number: row.noteNumber, date: row.noteDate }) },
  { type: "receipt", label: "Payment received", latest: (db, companyId, prefix) => db.salesReceipt.findFirst({ where: { companyId, receiptNumber: { startsWith: prefix } }, orderBy: { receiptNumber: "desc" }, select: { receiptNumber: true, receivedAt: true } }).then((row) => row && { number: row.receiptNumber, date: row.receivedAt }) },
  { type: "quotation", label: "Quote", latest: (db, companyId, prefix) => db.salesQuotation.findFirst({ where: { companyId, quotationNumber: { startsWith: prefix } }, orderBy: { quotationNumber: "desc" }, select: { quotationNumber: true, quotationDate: true } }).then((row) => row && { number: row.quotationNumber, date: row.quotationDate }) },
  { type: "bill", label: "Bill", latest: (db, companyId, prefix) => db.purchaseBill.findFirst({ where: { companyId, billNumber: { startsWith: prefix } }, orderBy: { billNumber: "desc" }, select: { billNumber: true, billDate: true } }).then((row) => row && { number: row.billNumber, date: row.billDate }) },
  { type: "payment", label: "Payment made", latest: (db, companyId, prefix) => db.purchasePayment.findFirst({ where: { companyId, paymentNumber: { startsWith: prefix } }, orderBy: { paymentNumber: "desc" }, select: { paymentNumber: true, paidAt: true } }).then((row) => row && { number: row.paymentNumber, date: row.paidAt }) },
  { type: "debit-note", label: "Debit note", latest: (db, companyId, prefix) => db.debitNote.findFirst({ where: { companyId, noteNumber: { startsWith: prefix } }, orderBy: { noteNumber: "desc" }, select: { noteNumber: true, noteDate: true } }).then((row) => row && { number: row.noteNumber, date: row.noteDate }) },
  { type: "write-off", label: "Write-off", latest: (db, companyId, prefix) => db.salesWriteOff.findFirst({ where: { companyId, writeOffNumber: { startsWith: prefix } }, orderBy: { writeOffNumber: "desc" }, select: { writeOffNumber: true, createdAt: true } }).then((row) => row && { number: row.writeOffNumber, date: row.createdAt }) },
  { type: "supplier-write-off", label: "Supplier write-off", latest: (db, companyId, prefix) => db.purchaseWriteOff.findFirst({ where: { companyId, writeOffNumber: { startsWith: prefix } }, orderBy: { writeOffNumber: "desc" }, select: { writeOffNumber: true, createdAt: true } }).then((row) => row && { number: row.writeOffNumber, date: row.createdAt }) },
  { type: "requisition", label: "Requisition", latest: (db, companyId, prefix) => db.crmRequisition.findFirst({ where: { companyId, requisitionNo: { startsWith: prefix } }, orderBy: { requisitionNo: "desc" }, select: { requisitionNo: true, createdAt: true } }).then((row) => row && { number: row.requisitionNo, date: row.createdAt }) },
  { type: "claim", label: "Claim", latest: (db, companyId, prefix) => db.expenseClaim.findFirst({ where: { companyId, claimNo: { startsWith: prefix } }, orderBy: { claimNo: "desc" }, select: { claimNo: true, createdAt: true } }).then((row) => row && { number: row.claimNo, date: row.createdAt }) },
  { type: "voucher", label: "Petty cash voucher", latest: (db, companyId, prefix) => db.pettyCashVoucher.findFirst({ where: { companyId, voucherNo: { startsWith: prefix } }, orderBy: { voucherNo: "desc" }, select: { voucherNo: true, spentAt: true } }).then((row) => row && { number: row.voucherNo, date: row.spentAt }) },
];

export type SeriesRow = {
  key: string;
  entity: string | null;
  label: string;
  prefix: string;
  next: string;
  issued: number;
  last: string | null;
  /** The prefix set for a new year, and from when. */
  nextYear: { prefix: string; from: string; first: string } | null;
  /** Journals number themselves: their prefix never changes. */
  fixedPrefix: boolean;
};

export type NumberingPage = {
  finding: { fact: string; rest: string | null };
  rows: SeriesRow[];
  /** "2027-01-01": the next year's first day, where a new prefix starts. */
  nextYearFrom: string;
  can: { change: boolean };
};

/** "INV-" and 145 → "INV-0145". Pure. */
export const formatNumber = (prefix: string, n: number) => `${prefix.endsWith("-") ? prefix : `${prefix}-`}${String(n).padStart(4, "0")}`;

export async function readNumbering(db: Db, companyId: string, can: NumberingPage["can"], now = new Date()): Promise<NumberingPage> {
  const today = dayOf(now);
  const [sequences, prefixes, settings, journals] = await Promise.all([
    db.idSequence.findMany({ where: { companyId }, select: { entityKey: true, scopeKey: true, lastNumber: true } }),
    seriesPrefixes(db, companyId),
    db.accountingSettings.findUnique({ where: { companyId }, select: { fiscalYearStartMonth: true } }),
    db.journalEntry.findFirst({ where: { companyId, entryNumber: { gt: 0 } }, orderBy: { entryNumber: "desc" }, select: { entryNumber: true, entryDate: true } }),
  ]);
  const fyStart = settings?.fiscalYearStartMonth ?? 1;
  const [y, m] = today.split("-").map(Number);
  const nextYear = m >= fyStart ? y + 1 : y;
  const nextYearFrom = `${nextYear}-${String(fyStart).padStart(2, "0")}-01`;
  const rows: SeriesRow[] = [];
  for (const series of NUMBERED) {
    const entity = SERIES[series.type] as ReservableIdEntity;
    const prefix = `${ID_ENTITY_CONFIG[entity].prefix}-`;
    const year = prefixes[entity];
    const live = year && today >= year.from;
    const counter = sequences.find((row) => row.entityKey === entity && row.scopeKey === (live ? `FROM:${year.from}` : "GLOBAL"));
    const latest = await series.latest(db, companyId, live ? year.prefix : prefix);
    const fromLatest = latest?.number ? Number(latest.number.slice((live ? year.prefix : prefix).length).replace(/^-/, "")) || 0 : 0;
    const issued = Math.max(counter?.lastNumber ?? 0, fromLatest);
    rows.push({
      key: series.type,
      entity,
      label: series.label,
      prefix: live ? year.prefix : prefix,
      next: formatNumber(live ? year.prefix : prefix, issued + 1),
      issued,
      last: latest?.number ? `${latest.number}${latest.date ? `, ${shortDay(storedDay(latest.date))}` : ""}` : null,
      nextYear: year && !live ? { prefix: year.prefix, from: year.from, first: formatNumber(year.prefix, 1) } : null,
      fixedPrefix: false,
    });
  }
  const journalCount = journals?.entryNumber ?? 0;
  rows.push({ key: "journal", entity: null, label: "Journal", prefix: "JE-", next: formatNumber("JE-", journalCount + 1), issued: journalCount, last: journals ? `${formatNumber("JE-", journals.entryNumber)}, ${shortDay(storedDay(journals.entryDate))}` : null, nextYear: null, fixedPrefix: true });
  return {
    finding: { fact: `${rows.length} document series, each counting up with no gaps.`, rest: "A number is given when the document is issued." },
    rows,
    nextYearFrom,
    can,
  };
}

/* ── Locks & periods ─────────────────────────────────────────────────── */

export type LockPolicy = "STRICT" | "MANAGER_OVERRIDE" | "SOFT_WARN";
export const LOCK_POLICY_WORD: Record<LockPolicy, string> = { STRICT: "Nobody posts into a closed month", MANAGER_OVERRIDE: "The owner or a manager may, with a reason", SOFT_WARN: "Anyone may, with a warning" };

export type PeriodRow = { id: string; month: string; from: string; state: "Open" | "Closed"; closed: string | null; reopened: string | null; reason: string | null };

export type LocksPage = {
  finding: { fact: string; rest: string | null };
  policy: LockPolicy;
  freezeBefore: string | null;
  freezeLabel: string | null;
  retainedEarnings: { id: string | null; label: string | null };
  periods: PeriodRow[];
  open: number;
  closed: number;
  can: { freeze: boolean; reopen: boolean; close: boolean };
};

export async function readLocks(db: Db, companyId: string, can: LocksPage["can"]): Promise<LocksPage> {
  const [settings, periods] = await Promise.all([
    db.accountingSettings.findUnique({ where: { companyId }, select: { periodLockPolicy: true, freezeBeforeDate: true, retainedEarningsAccountId: true } }),
    db.accountingPeriod.findMany({ where: { companyId }, orderBy: { startDate: "desc" }, take: 24, select: { id: true, startDate: true, status: true, closedAt: true, reopenedAt: true, reopenReason: true, closedBy: { select: { name: true } }, reopenedBy: { select: { name: true } } } }),
  ]);
  const retained = settings?.retainedEarningsAccountId ? await db.chartOfAccount.findUnique({ where: { id: settings.retainedEarningsAccountId }, select: { code: true, name: true } }) : null;
  const rows: PeriodRow[] = periods.map((period) => {
    const from = storedDay(period.startDate);
    const month = `${MONTH_LONG[Number(from.slice(5, 7)) - 1]} ${from.slice(0, 4)}`;
    return {
      id: period.id,
      month,
      from,
      state: period.status === "CLOSED" ? "Closed" : "Open",
      closed: period.closedAt ? `${shortDay(storedDay(period.closedAt))}${period.closedBy ? `, ${period.closedBy.name}` : ""}` : null,
      reopened: period.reopenedAt ? `${shortDay(storedDay(period.reopenedAt))}${period.reopenedBy ? `, ${period.reopenedBy.name}` : ""}` : null,
      reason: period.reopenReason,
    };
  });
  const closed = rows.filter((row) => row.state === "Closed");
  const freeze = settings?.freezeBeforeDate ? storedDay(settings.freezeBeforeDate) : null;
  const policy = (settings?.periodLockPolicy ?? "MANAGER_OVERRIDE") as LockPolicy;
  return {
    finding: closed.length
      ? { fact: `${closed.length} ${closed.length === 1 ? "month is" : "months are"} closed, the latest ${closed[0].month}.`, rest: freeze ? `Nothing posts on or before ${dayYear(freeze)}, open or closed.` : "Reopening a month is the owner’s, with a reason." }
      : { fact: "No month is closed yet.", rest: "Close one from the checklist when it is done." },
    policy,
    freezeBefore: freeze,
    freezeLabel: freeze ? dayYear(freeze) : null,
    retainedEarnings: { id: settings?.retainedEarningsAccountId ?? null, label: retained ? `${retained.code} ${retained.name}` : null },
    periods: rows,
    open: rows.length - closed.length,
    closed: closed.length,
    can,
  };
}

/* ── Opening balances ────────────────────────────────────────────────── */

export type OpeningBalances = {
  id: string | null;
  /** "28 Feb 2026". */
  dateLabel: string | null;
  date: string | null;
  posted: { on: string; by: string | null } | null;
  lines: Array<{ accountId: string; code: string; name: string; debit: number; credit: number }>;
  debit: number;
  credit: number;
  journalId: string | null;
};

export async function readOpeningBalances(db: Db, companyId: string): Promise<OpeningBalances> {
  const imports = await db.openingBalanceImport.findMany({ where: { companyId }, orderBy: { createdAt: "desc" }, select: { id: true, effectiveDate: true, journalEntryId: true, createdById: true, createdAt: true } });
  for (const row of imports) {
    if (!row.journalEntryId) continue;
    const entry = await db.journalEntry.findFirst({ where: { id: row.journalEntryId, companyId, status: "POSTED", reversedAt: null }, select: { id: true, lines: { select: { debit: true, credit: true, account: { select: { id: true, code: true, name: true } } } } } });
    if (!entry) continue;
    const by = row.createdById ? await db.user.findUnique({ where: { id: row.createdById }, select: { name: true } }) : null;
    const date = storedDay(row.effectiveDate);
    const lines = entry.lines.map((line) => ({ accountId: line.account.id, code: line.account.code, name: line.account.name, debit: round2(line.debit), credit: round2(line.credit) })).sort((a, b) => a.code.localeCompare(b.code));
    return {
      id: row.id,
      date,
      dateLabel: dayYear(date),
      posted: { on: dayYear(storedDay(row.createdAt)), by: by?.name ?? null },
      lines,
      debit: round2(lines.reduce((sum, line) => sum + line.debit, 0)),
      credit: round2(lines.reduce((sum, line) => sum + line.credit, 0)),
      journalId: entry.id,
    };
  }
  return { id: null, date: null, dateLabel: null, posted: null, lines: [], debit: 0, credit: 0, journalId: null };
}

/* ── Set up the books ────────────────────────────────────────────────── */

export type SetupStep = { key: string; label: string; detail: string; done: boolean; action: { label: string; href: string; primary?: boolean } | null };

export type SetupPage = {
  finding: { fact: string; rest: string | null };
  steps: SetupStep[];
  opening: OpeningBalances;
  seeded: boolean;
  can: { change: boolean };
};

export async function readSetup(db: Db, companyId: string, can: SetupPage["can"]): Promise<SetupPage> {
  const [settings, tax, banks, readiness, opening, rules, fiscal] = await Promise.all([
    db.accountingSettings.findUnique({ where: { companyId }, select: { baseCurrency: true, legalName: true, vatNumber: true, taxNumber: true } }),
    taxSettings(companyId, db),
    db.bankAccount.findMany({ where: { companyId, isActive: true }, select: { kind: true, isFloat: true } }),
    getAccountingSetupReadiness(companyId),
    readOpeningBalances(db, companyId),
    db.postingRule.findMany({ where: { companyId, isActive: true }, select: { name: true, lines: { select: { accountId: true, accountSource: true, accountRole: true, eventAccountKey: true } } } }),
    db.fiscalisationProviderConfig.findFirst({ where: { companyId }, select: { deviceId: true, isTestDevice: true, isActive: true } }).catch(() => null),
  ]);
  const accounts = Object.values(readiness.accountCounts ?? {}).reduce((sum, n) => sum + n, 0) || (await db.chartOfAccount.count({ where: { companyId } }));
  const count = (kind: string) => banks.filter((bank) => String(bank.kind) === kind).length;
  const missing = rules.find((rule) => rule.lines.some((line) => line.accountSource === "FIXED_ACCOUNT" && !line.accountId && !line.accountRole && !line.eventAccountKey));
  const details = Boolean(settings?.legalName || settings?.vatNumber || settings?.taxNumber);
  const steps: SetupStep[] = [
    { key: "details", label: "Business and tax details", detail: `VAT category ${tax.vat.category} · base currency ${settings?.baseCurrency ?? "USD"}`, done: details, action: { label: "Management", href: "/management/money-and-tax" } },
    { key: "accounts", label: "Money accounts", detail: banks.length ? [count("BANK") && `${count("BANK")} bank`, count("MOBILE") && `${count("MOBILE")} mobile money`, count("CASH") && `${count("CASH")} cash`].filter(Boolean).join(", ") : "None yet", done: banks.length > 0, action: { label: "Management", href: "/management/money-accounts" } },
    { key: "chart", label: "Chart of accounts", detail: accounts ? `Zimbabwe pack, ${accounts} accounts` : "Not set up", done: accounts > 0, action: accounts ? { label: "Chart of accounts", href: "/books/chart" } : null },
    { key: "opening", label: "Opening balances", detail: opening.posted ? `Posted ${opening.posted.on}` : "None yet: the books start from nothing", done: Boolean(opening.posted), action: { label: "Opening balances", href: "/books/settings/opening-balances" } },
    { key: "rules", label: "Posting rules ready", detail: missing ? `${missing.name} has no account` : `${rules.length} rules, each with its accounts`, done: !missing && rules.length > 0, action: missing ? { label: "Map the account", href: "/books/posting-rules", primary: true } : { label: "Posting rules", href: "/books/posting-rules" } },
    { key: "fiscal", label: "Fiscal device", detail: fiscal?.deviceId ? `Device ${fiscal.deviceId}, ${fiscal.isTestDevice ? "test" : fiscal.isActive ? "live" : "off"}` : "None: invoices are not fiscalised", done: Boolean(fiscal?.deviceId), action: { label: "Management", href: "/retail/manage/fiscal" } },
  ];
  const left = steps.filter((step) => !step.done);
  const blocking = steps.find((step) => step.key === "rules" && !step.done && missing);
  return {
    finding: left.length === 0
      ? { fact: "The books are set up.", rest: "Everything posts on its own." }
      : blocking && left.length === 1
        ? { fact: "The books are set up, but for one account.", rest: `Map an account for ${missing!.name}.` }
        : { fact: `The books are set up but for ${left.length} ${left.length === 1 ? "step" : "steps"}.`, rest: `Next: ${left[0].label.toLowerCase()}.` },
    steps,
    opening,
    seeded: accounts > 0,
    can,
  };
}

/* ── Year end ────────────────────────────────────────────────────────── */

export type YearEndStep = { key: string; step: string; what: string; when: string; state: "Done" | "Due" | "Not yet" };

export type YearEndPage = {
  finding: { fact: string; rest: string | null };
  steps: YearEndStep[];
  done: number;
  yearEnds: string;
  rail: { thisYear: string; booksStart: string | null; retainedEarnings: string | null; closingBy: string };
  /** The export's period: the year so far. */
  exportFrom: string;
  exportTo: string;
};

export async function readYearEnd(db: Db, companyId: string, now = new Date()): Promise<YearEndPage> {
  const today = dayOf(now);
  const [settings, first] = await Promise.all([
    db.accountingSettings.findUnique({ where: { companyId }, select: { fiscalYearStartMonth: true, retainedEarningsAccountId: true, baseCurrency: true } }),
    db.journalEntry.findFirst({ where: { companyId, status: "POSTED" }, orderBy: { entryDate: "asc" }, select: { entryDate: true } }),
  ]);
  const fyStart = settings?.fiscalYearStartMonth ?? 1;
  const [y, m] = today.split("-").map(Number);
  const startYear = m >= fyStart ? y : y - 1;
  const start = `${startYear}-${String(fyStart).padStart(2, "0")}-01`;
  const endDate = new Date(Date.UTC(startYear + 1, fyStart - 1, 0));
  const end = endDate.toISOString().slice(0, 10);
  const lastMonth = end.slice(0, 7);
  const lastMonthName = MONTH_LONG[Number(end.slice(5, 7)) - 1];
  const daysLeft = Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  const c = settings?.baseCurrency ?? "USD";
  const [period, reval, exported, qpd, retained] = await Promise.all([
    db.accountingPeriod.findFirst({ where: { companyId, startDate: { gte: new Date(`${lastMonth}-01T00:00:00Z`), lt: new Date(Date.parse(`${end}T00:00:00Z`) + 86_400_000) } }, select: { status: true, closeVouchers: { select: { journalEntryId: true, reversedAt: true } } } }),
    db.journalEntry.findFirst({ where: { companyId, sourceType: "FX_REVALUATION", sourceId: `reval:${lastMonth}`, voidedAt: null }, select: { id: true } }),
    db.platformAuditEvent.findFirst({ where: { companyId, eventType: "books.accountant-export.downloaded", createdAt: { gt: new Date(`${end}T00:00:00Z`) } }, select: { id: true } }),
    provisionalTax(companyId, Number(end.slice(0, 4)), now, db).catch(() => null),
    settings?.retainedEarningsAccountId ? db.chartOfAccount.findUnique({ where: { id: settings.retainedEarningsAccountId }, select: { code: true } }) : db.chartOfAccount.findFirst({ where: { companyId, type: "EQUITY", name: { contains: "etained", mode: "insensitive" } }, select: { code: true } }),
  ]);
  const closedLast = period?.status === "CLOSED";
  const closingEntry = Boolean(period?.closeVouchers.some((voucher) => voucher.journalEntryId && !voucher.reversedAt));
  const fourth = qpd?.instalments[3];
  const fourthState: YearEndStep["state"] = !fourth ? "Not yet" : fourth.outstanding < 0.005 && (fourth.amount ?? 0) > 0 ? "Done" : fourth.paymentDue <= addDays(today, 60) ? "Due" : "Not yet";
  const itf = `${Number(end.slice(0, 4)) + 1}-04-30`;
  const steps: YearEndStep[] = [
    { key: "close", step: `Close ${lastMonthName}`, what: "The month-end checklist", when: `After ${shortDay(end)}`, state: closedLast ? "Done" : "Not yet" },
    { key: "revalue", step: "Revalue ZWG balances", what: `At the ${shortDay(end)} rate`, when: shortDay(end), state: reval ? "Done" : "Not yet" },
    { key: "qpd", step: "Pay the 4th provisional tax", what: fourth?.amount ? `${money(fourth.amount, c)}, ${fourth.share}% of the estimate` : "No estimate for the year yet", when: fourth ? shortDay(fourth.paymentDue) : "—", state: fourthState },
    { key: "closing", step: "Post the closing entry", what: `The year’s profit to ${retained?.code ?? "retained earnings"}`, when: `After ${lastMonthName}`, state: closingEntry ? "Done" : "Not yet" },
    { key: "export", step: "Send the year to your accountant", what: "The accountant export", when: MONTH_LONG[(Number(end.slice(5, 7))) % 12], state: exported ? "Done" : "Not yet" },
    { key: "itf12c", step: "File the income tax return, ITF12C", what: "Your accountant files it in TaRMS", when: dayYear(itf), state: today > itf ? "Due" : "Not yet" },
  ];
  const endsOn = `${WEEKDAY_LONG[endDate.getUTCDay()]} ${Number(end.slice(8, 10))} ${lastMonthName}`;
  return {
    finding: { fact: daysLeft >= 0 ? `The year ends on ${endsOn}, in ${daysLeft} ${daysLeft === 1 ? "day" : "days"}.` : `The year ended on ${endsOn}.`, rest: `${steps.length} steps take the books there.`.replace(/^6/, "Six") },
    steps,
    done: steps.filter((step) => step.state === "Done").length,
    yearEnds: dayYear(end),
    rail: { thisYear: `${shortDay(start)} to ${dayYear(end)}`, booksStart: first ? dayYear(storedDay(first.entryDate)) : null, retainedEarnings: retained?.code ?? null, closingBy: "Owner or accountant" },
    exportFrom: start,
    exportTo: end < today ? end : today,
  };
}

function addDays(iso: string, n: number) {
  const date = new Date(`${iso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + n);
  return date.toISOString().slice(0, 10);
}
