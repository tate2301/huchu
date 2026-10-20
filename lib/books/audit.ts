import type { PrismaClient } from "@prisma/client";
import { z } from "zod";

import { dayOf, money } from "./format";

/**
 * Books → Ledger → Audit trail (design/core-modules/boards/view/BkAudit.html):
 * every change to a posted record, from the hash-chained `PlatformAuditEvent`
 * rows Books writes (`books.*`: voids, revisions, deletes with their
 * snapshots, purges, reversals, reconciliations), months reopened, postings
 * into a closed month, and the operators who signed in to make changes. Each
 * row says who, why and what was kept.
 */

type Db = PrismaClient;

export const AUDIT_KINDS = ["all", "void", "revise", "delete", "reopen", "override", "superuser", "other"] as const;
export type AuditKind = (typeof AUDIT_KINDS)[number];
export const AUDIT_KIND_LABEL: Record<AuditKind, string> = { all: "All", void: "Voids", revise: "Revisions", delete: "Deletes", reopen: "Reopenings", override: "Overrides", superuser: "Signed in as", other: "Other changes" };

export const AUDIT_DATES = ["this-month", "last-month", "this-year", "all"] as const;
export type AuditDates = (typeof AUDIT_DATES)[number];
export const AUDIT_DATES_LABEL: Record<AuditDates, string> = { "this-month": "This month", "last-month": "Last month", "this-year": "This year", all: "Any time" };

export const auditQuery = z.object({
  q: z.string().trim().max(100).catch(""),
  kind: z.enum(AUDIT_KINDS).catch("all"),
  dates: z.enum(AUDIT_DATES).catch("this-month"),
  page: z.coerce.number().int().min(1).catch(1),
  event: z.string().max(80).catch(""),
});
export type AuditQuery = z.infer<typeof auditQuery>;

export type AuditRow = {
  id: string;
  /** "Mon 12 Oct 16:21". */
  when: string;
  at: string;
  who: { name: string; image: string | null; sub: string | null; operator: string | null; session: string | null };
  kind: Exclude<AuditKind, "all">;
  /** "Voided". */
  what: string;
  /** "INV-0143 → CN-0009". */
  detail: string | null;
  reason: string | null;
  /** The snapshot or payload kept with the event, as lines. */
  kept: string | null;
  /** The record it is about, when it still has a page. */
  href: string | null;
  chained: boolean;
};

export type AuditPage = {
  finding: { fact: string; rest: string | null };
  query: AuditQuery;
  rows: AuditRow[];
  range: { from: number; to: number; of: number };
  sums: { void: number; revise: number; delete: number };
  selected: AuditRow | null;
  chainUnbroken: boolean;
};

export const AUDIT_PAGE_SIZE = 25;

const VERB: Record<string, [Exclude<AuditKind, "all">, string]> = {
  voided: ["void", "Voided"],
  credited: ["void", "Credited in full"],
  mirrored: ["void", "Reversed its posting"],
  "payout-reversed": ["void", "Reversed the payout"],
  "reimbursement-voided": ["void", "Voided the reimbursement"],
  reversed: ["void", "Reversed"],
  revised: ["revise", "Revised"],
  deleted: ["delete", "Deleted permanently"],
  purged: ["delete", "Purged test documents"],
  reopened: ["reopen", "Reopened"],
  redated: ["override", "Moved into this month"],
  "posted-into-closed-month": ["override", "Posted into a closed month"],
  closed: ["other", "Closed"],
  "test-mode": ["other", "Marked a test device"],
  mapped: ["other", "Mapped an account"],
  posted: ["other", "Posted"],
  downloaded: ["other", "Downloaded"],
};
const NOUN: Record<string, string> = { "accountant-export": "Accountant export", invoice: "Invoice", bill: "Bill", receipt: "Payment received", "payment-made": "Payment made", "credit-note": "Credit note", "debit-note": "Debit note", journal: "Journal", reconciliation: "Reconciliation", "bank-entry": "Bank entry", claim: "Claim", voucher: "Voucher", requisition: "Requisition", commission: "Commission", "fiscal-device": "Fiscal device", posting: "Posting", revaluation: "Revaluation", quote: "Quote", "write-off": "Write-off" };
const PAGE: Record<string, string> = { SalesInvoice: "/books/invoices/", PurchaseBill: "/books/bills/", JournalEntry: "/books/journals?journal=", BankReconciliation: "/books/reconciliations/", CrmRequisition: "/books/requisitions/" };

/** "books.invoice.voided" → the kind and the words. Pure. */
export function describeEvent(eventType: string): { kind: Exclude<AuditKind, "all">; what: string; noun: string | null } {
  const [, noun = "", verb = ""] = eventType.split(".");
  const [kind, what] = VERB[verb] ?? ["other", verb ? verb.charAt(0).toUpperCase() + verb.slice(1).replace(/-/g, " ") : eventType];
  return { kind, what, noun: NOUN[noun] ?? (noun ? noun.charAt(0).toUpperCase() + noun.slice(1).replace(/-/g, " ") : null) };
}

/** The payload's number and what replaced it: "INV-0143 → CN-0009". Pure. */
export function eventDetail(noun: string | null, payload: Record<string, unknown>): string | null {
  const number = typeof payload.number === "string" ? payload.number : null;
  const to = typeof payload.creditNote === "string" ? payload.creditNote : typeof payload.mirror === "string" ? payload.mirror : typeof payload.replacedByNumber === "string" ? payload.replacedByNumber : null;
  if (number && to) return `${number} → ${to}`;
  if (number) return number;
  if (typeof payload.total === "number" && noun) return `${noun}, ${money(payload.total, typeof payload.currency === "string" ? payload.currency : "USD")}`;
  return noun;
}

const SKIP_KEYS = new Set(["by", "at"]);

/** What was kept, as short lines a person can read: `key: value`, a snapshot's fields one level down. Pure. */
export function keptLines(payload: Record<string, unknown>, limit = 14): string | null {
  const lines: string[] = [];
  const show = (value: unknown): string => {
    if (value === null || value === undefined) return "—";
    // A list of records reads as their numbers: "REC-0094, REC-0095".
    if (Array.isArray(value)) return value.map((item) => (item && typeof item === "object" && "number" in item ? String((item as { number: unknown }).number) : JSON.stringify(item))).join(", ").slice(0, 80) || "none";
    return typeof value === "object" ? JSON.stringify(value).slice(0, 80) : String(value);
  };
  for (const [key, value] of Object.entries(payload)) {
    if (SKIP_KEYS.has(key)) continue;
    if (key === "snapshot" && value && typeof value === "object") {
      for (const [inner, innerValue] of Object.entries(value as Record<string, unknown>)) {
        if (/Id$|^id$|^companyId$/.test(inner) || innerValue === null) continue;
        lines.push(`${inner}: ${show(innerValue)}`);
      }
      continue;
    }
    lines.push(`${key}: ${show(value)}`);
  }
  return lines.length ? lines.slice(0, limit).join("\n") : null;
}

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Mon 12 Oct 16:21", in Harare. */
export function whenLabel(value: Date): string {
  const local = new Date(value.getTime() + 2 * 3600_000);
  return `${WEEKDAY[local.getUTCDay()]} ${local.getUTCDate()} ${MONTH[local.getUTCMonth()]} ${String(local.getUTCHours()).padStart(2, "0")}:${String(local.getUTCMinutes()).padStart(2, "0")}`;
}

const ROLE_WORD: Record<string, string> = { SUPERADMIN: "Owner", MANAGER: "Manager", FINANCE_OFFICER: "Accountant", BURSAR: "Bursar", SHOP_MANAGER: "Shop manager" };

function since(dates: AuditDates, now: Date): Date | null {
  const today = dayOf(now);
  const [y, m] = today.split("-").map(Number);
  if (dates === "this-month") return new Date(Date.UTC(y, m - 1, 1) - 2 * 3600_000);
  if (dates === "last-month") return new Date(Date.UTC(y, m - 2, 1) - 2 * 3600_000);
  if (dates === "this-year") return new Date(Date.UTC(y, 0, 1) - 2 * 3600_000);
  return null;
}
function until(dates: AuditDates, now: Date): Date | null {
  if (dates !== "last-month") return null;
  const [y, m] = dayOf(now).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1) - 2 * 3600_000);
}

export async function readAudit(db: Db, companyId: string, query: AuditQuery, now = new Date()): Promise<AuditPage> {
  const from = since(query.dates, now);
  const to = until(query.dates, now);
  const window = { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) };
  const [events, reopened, overrides, sessions, hashes] = await Promise.all([
    db.platformAuditEvent.findMany({
      where: { companyId, eventType: { startsWith: "books." }, NOT: { eventType: { in: ["books.journal.posted-into-closed-month", "books.accountant-export.downloaded"] } }, ...(from || to ? { createdAt: window } : {}) },
      select: { id: true, actor: true, eventType: true, entityType: true, entityId: true, reason: true, payloadJson: true, prevEventHash: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 2000,
    }),
    db.accountingPeriod.findMany({ where: { companyId, reopenedAt: { not: null, ...(from || to ? window : {}) } }, select: { id: true, startDate: true, reopenedAt: true, reopenedById: true, reopenReason: true } }),
    db.journalEntry.findMany({ where: { companyId, periodOverrideAt: { not: null, ...(from || to ? window : {}) } }, select: { id: true, entryNumber: true, description: true, periodOverrideAt: true, periodOverrideById: true, periodOverrideReason: true } }),
    db.signInAsSession.findMany({ where: { companyId, mode: "CHANGE", ...(from || to ? { startedAt: window } : {}) }, select: { id: true, number: true, reason: true, startedAt: true, endedAt: true, memberId: true, operator: { select: { name: true } } } }),
    db.platformAuditEvent.findMany({ where: { companyId }, select: { eventHash: true, prevEventHash: true } }),
  ]);
  const known = new Set(hashes.map((row) => row.eventHash));
  const brokenLinks = hashes.filter((row) => row.prevEventHash && !known.has(row.prevEventHash)).length;
  const userIds = new Set<string>();
  for (const event of events) if (event.actor) userIds.add(event.actor);
  for (const period of reopened) if (period.reopenedById) userIds.add(period.reopenedById);
  for (const entry of overrides) if (entry.periodOverrideById) userIds.add(entry.periodOverrideById);
  for (const session of sessions) userIds.add(session.memberId);
  const users = new Map((await db.user.findMany({ where: { id: { in: [...userIds] } }, select: { id: true, name: true, role: true, image: true } })).map((user) => [user.id, user]));
  const person = (id: string | null | undefined, superuser?: { operator?: string; session?: string } | null) => {
    const user = id ? users.get(id) : undefined;
    if (superuser?.operator) return { name: `${superuser.operator}, as ${user?.name?.split(" ")[0] ?? "the member"}`, image: null, sub: `Sign in as · ${superuser.session ?? ""}`.trim(), operator: superuser.operator, session: superuser.session ?? null };
    return { name: user?.name ?? "Someone no longer here", image: user?.image ?? null, sub: user ? ROLE_WORD[user.role] ?? null : null, operator: null, session: null };
  };

  const rows: AuditRow[] = [];
  for (const event of events) {
    let payload: Record<string, unknown> = {};
    try {
      payload = event.payloadJson ? (JSON.parse(event.payloadJson) as Record<string, unknown>) : {};
    } catch {
      payload = {};
    }
    const { kind, what, noun } = describeEvent(event.eventType);
    const by = (payload.by ?? null) as { superuser?: { operator?: string; session?: string } } | null;
    const page = event.entityType && event.entityId && PAGE[event.entityType] && kind !== "delete" ? `${PAGE[event.entityType]}${event.entityId}` : null;
    rows.push({
      id: event.id,
      when: whenLabel(event.createdAt),
      at: event.createdAt.toISOString(),
      who: person(event.actor, by?.superuser ?? null),
      kind,
      what,
      detail: eventDetail(noun, payload),
      reason: event.reason,
      kept: keptLines(payload),
      href: page,
      chained: !event.prevEventHash || known.has(event.prevEventHash),
    });
  }
  for (const period of reopened) {
    const month = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(period.startDate);
    rows.push({ id: `period-${period.id}`, when: whenLabel(period.reopenedAt!), at: period.reopenedAt!.toISOString(), who: person(period.reopenedById), kind: "reopen", what: "Reopened a month", detail: month, reason: period.reopenReason, kept: `month: ${month}\nclosed again: when its checklist passes`, href: "/books/periods", chained: true });
  }
  for (const entry of overrides) {
    rows.push({ id: `override-${entry.id}`, when: whenLabel(entry.periodOverrideAt!), at: entry.periodOverrideAt!.toISOString(), who: person(entry.periodOverrideById), kind: "override", what: "Posted into a closed month", detail: `${entry.entryNumber > 0 ? `JE-${String(entry.entryNumber).padStart(4, "0")}, ` : ""}${entry.description}`.slice(0, 60), reason: entry.periodOverrideReason, kept: null, href: `/books/journals?journal=${entry.id}`, chained: true });
  }
  for (const session of sessions) {
    rows.push({ id: `session-${session.id}`, when: whenLabel(session.startedAt), at: session.startedAt.toISOString(), who: person(session.memberId, { operator: `${session.operator.name}, Corelith support`, session: `SA-${session.number}` }), kind: "superuser", what: "Signed in to make changes", detail: session.endedAt ? `Until ${whenLabel(session.endedAt).split(" ").at(-1)}` : "Still signed in", reason: session.reason, kept: `operator: ${session.operator.name}\nmode: Change\nsession: SA-${session.number}`, href: null, chained: true });
  }
  rows.sort((a, b) => (a.at < b.at ? 1 : -1));
  const needle = query.q.toLowerCase();
  const matching = rows.filter((row) => (query.kind === "all" || row.kind === query.kind) && (!needle || [row.who.name, row.what, row.detail ?? "", row.reason ?? ""].some((text) => text.toLowerCase().includes(needle))));
  const start = (query.page - 1) * AUDIT_PAGE_SIZE;
  const page = matching.slice(start, start + AUDIT_PAGE_SIZE);
  const count = (kind: AuditKind) => rows.filter((row) => row.kind === kind).length;
  const changed = rows.filter((row) => row.kind !== "superuser").length;
  const selected = matching.find((row) => row.id === query.event) ?? page[0] ?? null;
  const span = AUDIT_DATES_LABEL[query.dates].toLowerCase();
  return {
    finding: rows.length === 0
      ? { fact: `No changes to posted records ${query.dates === "all" ? "yet" : span}.`, rest: "Voids, revisions, deletes and reopened months show here, each with who and why." }
      : { fact: `${changed} ${changed === 1 ? "change" : "changes"} to posted records ${query.dates === "all" ? "so far" : span}.`, rest: "Each with who, why and what was kept." },
    query,
    rows: page,
    range: { from: matching.length ? start + 1 : 0, to: start + page.length, of: matching.length },
    sums: { void: count("void"), revise: count("revise"), delete: count("delete") },
    selected,
    chainUnbroken: brokenLinks === 0,
  };
}

/** Every matching row, for Export. */
export async function auditCsv(db: Db, companyId: string, query: AuditQuery): Promise<string> {
  const all = await readAudit(db, companyId, { ...query, page: 1 });
  const total = all.range.of;
  const rows: AuditRow[] = [...all.rows];
  for (let page = 2; rows.length < total && page < 200; page += 1) rows.push(...(await readAudit(db, companyId, { ...query, page })).rows);
  const cell = (value: string | null) => {
    const text = value ?? "";
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return `${["When,Who,What,Detail,Reason", ...rows.map((row) => [row.at, row.who.name, row.what, row.detail, row.reason].map(cell).join(","))].join("\n")}\n`;
}
