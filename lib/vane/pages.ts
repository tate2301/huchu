import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";

import { SHOP_TIME_ZONE } from "@/lib/retail/shop-profile-rules";

import { moduleName, vaneActionSchema, type VaneAction, type VaneCard, type VanePlanCard } from "./panel";
import { watchablesFor } from "./settings";
import { parseTools, vaneState, type VaneState } from "./state";
import { audienceFilter, FOR_YOU, vaneStatus, type VaneStatus } from "./status";
import { cardKey, notStopped, stopOffer, type StopOffer } from "./stops";

export { parseTools, vaneState, type VaneState };

/**
 * What `/vane` and its pages read (design/core-modules/spec/routes.md §8):
 * For you across every module, what Vane is working on, its plans, what it
 * did, what was set aside, and the state it is in. Reading only: every change
 * goes through the APIs a person calls (`/api/vane/settings`, `…/mute`,
 * `…/jobs`).
 */

type Db = Pick<PrismaClient, "vaneItem" | "vaneJob" | "vanePlan" | "vaneSettings" | "vaneCardChoice">;
type Who = { companyId: string; userId: string; role?: string | null };

/** The jobs Vane has not finished: queued, running, or waiting to try again. */
export const UNFINISHED = ["QUEUED", "RUNNING", "WAITING"] as const;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The workspace's calendar day, "2026-10-14", on the shop clock. */
export function shopDay(at: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: SHOP_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

/** Midnight at the start of the shop's day (Harare keeps UTC+2 all year). */
export function startOfShopDay(at: Date): Date {
  return new Date(`${shopDay(at)}T00:00:00+02:00`);
}

/** The start of this month, as the worker counts jobs against the allowance (`jobs.ts`). */
function monthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function parseAction(value: unknown): VaneAction | null {
  const parsed = vaneActionSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

const readFromSchema = z.array(z.object({ table: z.string(), rows: z.number().int().nonnegative() }));

/** What a card read, as it keeps it: `[{ table, rows }]`. Anything else reads as nothing. */
export function parseReadFrom(value: unknown): Array<{ table: string; rows: number }> {
  const parsed = readFromSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}

/** The tables a card can say it read, by the names and pages people know them by. */
const TABLES: Record<string, { label: string; href: string | null }> = {
  SalesInvoice: { label: "Invoices", href: "/books/invoices" },
  SalesQuotation: { label: "Quotes", href: "/crm/quotes" },
  SalesReceipt: { label: "Receipts", href: "/books/payments" },
  Customer: { label: "Customers", href: "/accounting/sales" },
  CrmDeal: { label: "Deals", href: "/crm/deals" },
  CrmLead: { label: "Leads", href: "/crm/leads" },
  CrmTask: { label: "Tasks", href: "/crm/tasks" },
  CrmFollowUp: { label: "Follow-ups", href: "/crm/follow-ups" },
  CrmSite: { label: "Sites", href: null },
  PurchaseBill: { label: "Bills", href: "/accounting/purchases" },
  BankTransaction: { label: "Bank lines", href: "/books/bank" },
  JournalEntry: { label: "Journals", href: "/books/journals" },
  VatReturn: { label: "VAT returns", href: "/books/vat" },
  RetailSale: { label: "Sales", href: "/retail/sales" },
  RetailShift: { label: "Till shifts", href: "/retail/shifts" },
  Employee: { label: "Employees", href: "/people" },
};

/** A table a card read, named as people know it, with the page that lists it when there is one. */
export function tableLabel(table: string): { label: string; href: string | null } {
  // The reader names tables as Postgres folds them ("salesinvoice"); the app names them "SalesInvoice".
  const known = TABLES[table] ?? Object.entries(TABLES).find(([name]) => name.toLowerCase() === table.toLowerCase())?.[1];
  return known ?? { label: table.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase()), href: null };
}

// ---------------------------------------------------------------------------
// The panel's rows: counts and what Vane watches.

export type VaneCounts = {
  /** Open For you cards this person can see. */
  forYou: number;
  /** Jobs queued, running or waiting. */
  working: number;
  /** Plans still open. */
  plans: number;
  /** Jobs finished since midnight on the shop clock. */
  doneToday: number;
  /** Cards set aside that this person can see. */
  muted: number;
};

export type VaneWatch = { key: string; name: string };

export type VaneNav = { counts: VaneCounts; watching: VaneWatch[] };

/** The modules Vane watches in this workspace: what it runs, less what Management → Vane turned off. */
export function watchingFor(enabledFeatures: readonly string[] | undefined, watches: unknown): VaneWatch[] {
  const off = watches && typeof watches === "object" ? (watches as Record<string, unknown>) : {};
  return watchablesFor(enabledFeatures)
    .filter((entry) => off[entry.key] !== false)
    .map((entry) => ({ key: entry.key, name: entry.name }));
}

export async function vaneCounts(db: Db, { companyId, userId, role }: Who, now: Date = new Date()): Promise<VaneCounts> {
  const audience = audienceFilter(userId, role);
  const stopped = await notStopped(db, companyId, userId);
  const [forYou, working, plans, doneToday, muted] = await Promise.all([
    db.vaneItem.count({ where: { companyId, status: "OPEN", kind: { in: FOR_YOU }, ...audience, ...stopped } }),
    db.vaneJob.count({ where: { companyId, status: { in: [...UNFINISHED] } } }),
    db.vanePlan.count({ where: { companyId, status: "OPEN" } }),
    db.vaneJob.count({ where: { companyId, status: "DONE", finishedAt: { gte: startOfShopDay(now) } } }),
    db.vaneItem.count({ where: { companyId, status: "MUTED", kind: { in: FOR_YOU }, ...audience } }),
  ]);
  return { forYou, working, plans, doneToday, muted };
}

export async function vaneNav(
  db: Db,
  who: Who & { enabledFeatures?: readonly string[] },
  now: Date = new Date(),
): Promise<VaneNav> {
  const [counts, settings] = await Promise.all([
    vaneCounts(db, who, now),
    db.vaneSettings.findUnique({ where: { companyId: who.companyId }, select: { watches: true } }),
  ]);
  return { counts, watching: watchingFor(who.enabledFeatures, settings?.watches) };
}

// ---------------------------------------------------------------------------
// For you (VaneForYou).

export type VaneForYouCard = VaneCard & {
  /** The module key it came from ("books"), for narrowing by what Vane watches. */
  module: string;
  /** It carries the question it ran, so What I read has something to show. */
  read: boolean;
};

export type VaneWorkingJob = {
  id: string;
  label: string;
  progress: string | null;
  status: "queued" | "running" | "waiting";
};

export type VaneForYou = {
  status: VaneStatus;
  state: VaneState | null;
  counts: VaneCounts;
  /** The modules the cards came from, in the order of the most cards. */
  sources: string[];
  items: VaneForYouCard[];
  working: VaneWorkingJob[];
  /** The open plan due soonest, broken down. */
  plan: VanePlanCard | null;
  doneToday: Array<{ id: string; text: string; at: string }>;
};

function progressOf(job: { progressDone: number | null; progressTotal: number | null }): string | null {
  return job.progressTotal != null ? `${job.progressDone ?? 0} of ${job.progressTotal}` : null;
}

function planCard(plan: {
  id: string;
  title: string;
  dueOn: Date | null;
  steps: Array<{ id: string; label: string; owner: "VANE" | "PERSON"; status: "TODO" | "NOW" | "DONE"; progressLabel: string | null }>;
}): VanePlanCard {
  return {
    id: plan.id,
    title: plan.title,
    dueOn: plan.dueOn ? plan.dueOn.toISOString().slice(0, 10) : null,
    done: plan.steps.filter((step) => step.status === "DONE").length,
    steps: plan.steps.map((step) => ({
      id: step.id,
      label: step.label,
      owner: step.owner === "VANE" ? "vane" : "person",
      status: step.status === "DONE" ? "done" : step.status === "NOW" ? "now" : "todo",
      progress: step.progressLabel,
    })),
  };
}

const STEP_SELECT = {
  orderBy: { position: "asc" },
  select: { id: true, label: true, owner: true, status: true, progressLabel: true, doneAt: true },
} as const satisfies Prisma.VanePlan$stepsArgs;

/**
 * For you across every module (not this module first, as the panel does),
 * newest first; with `module`, only that module's. Beside it, what Vane is
 * working on, the open plan due soonest, and what it finished today.
 */
export async function vaneForYou(
  db: Db,
  who: Who & { module?: string | null },
  now: Date = new Date(),
): Promise<VaneForYou> {
  const { companyId, userId, role, module } = who;
  const stopped = await notStopped(db, companyId, userId);
  const [status, state, counts, items, working, plan, done] = await Promise.all([
    vaneStatus(db, { companyId, userId, role }),
    vaneState(db, companyId, now),
    vaneCounts(db, who, now),
    db.vaneItem.findMany({
      where: { companyId, status: "OPEN", kind: { in: FOR_YOU }, ...audienceFilter(userId, role), ...stopped },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, kind: true, sourceModule: true, headline: true, body: true, action: true, createdAt: true, sql: true },
    }),
    db.vaneJob.findMany({
      where: { companyId, status: { in: [...UNFINISHED] } },
      orderBy: [{ startedAt: { sort: "desc", nulls: "last" } }, { createdAt: "asc" }],
      take: 10,
      select: { id: true, label: true, status: true, progressDone: true, progressTotal: true },
    }),
    db.vanePlan.findFirst({
      where: { companyId, status: "OPEN" },
      orderBy: [{ dueOn: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
      select: { id: true, title: true, dueOn: true, steps: STEP_SELECT },
    }),
    db.vaneJob.findMany({
      where: { companyId, status: "DONE", finishedAt: { gte: startOfShopDay(now) } },
      orderBy: { finishedAt: "desc" },
      take: 8,
      select: { id: true, label: true, result: true, finishedAt: true },
    }),
  ]);

  const cards = items.map<VaneForYouCard>((item) => ({
    id: item.id,
    kind: item.kind === "ISSUE" ? "issue" : "suggestion",
    module: item.sourceModule,
    source: moduleName(item.sourceModule),
    headline: item.headline,
    body: item.body,
    action: parseAction(item.action),
    createdAt: item.createdAt.toISOString(),
    read: Boolean(item.sql?.trim()),
  }));
  const tally = new Map<string, number>();
  for (const card of cards) tally.set(card.source, (tally.get(card.source) ?? 0) + 1);
  const sources = [...tally.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);

  return {
    status,
    state,
    counts,
    sources,
    items: module ? cards.filter((card) => card.module === module) : cards,
    working: working.map((job) => ({
      id: job.id,
      label: job.label,
      progress: progressOf(job),
      status: job.status === "RUNNING" ? "running" : job.status === "WAITING" ? "waiting" : "queued",
    })),
    plan: plan ? planCard(plan) : null,
    doneToday: done.map((job) => ({ id: job.id, text: firstLine(job.result) || job.label, at: (job.finishedAt ?? now).toISOString() })),
  };
}

/** A job's answer, as one line: its first sentence or line. */
export function firstLine(text: string | null | undefined): string {
  const trimmed = text?.trim() ?? "";
  if (!trimmed) return "";
  const line = trimmed.split(/\n/)[0]!.trim();
  const sentence = /^(.+?[.!?])(\s|$)/.exec(line)?.[1] ?? line;
  return sentence.length > 140 ? `${sentence.slice(0, 139)}…` : sentence;
}

// ---------------------------------------------------------------------------
// A card, and what Vane read for it (PageVaneCard).

export type VaneDraft = {
  number: string;
  kind: "invoice" | "quote";
  customer: string;
  lines: number;
  total: number;
  currency: string;
  /** The invoice's due date, or how long the quote holds. */
  due: string | null;
  href: string;
};

export type VaneCardDetail = VaneForYouCard & {
  status: "open" | "done" | "muted";
  readFrom: Array<{ table: string; label: string; href: string | null; rows: number }>;
  sql: string | null;
  /** The rows the question answered: the most any table it read gave. */
  rows: number;
  job: { id: string; label: string; finishedAt: string | null } | null;
  /** The draft the card is about, when Vane made it (`madeByVane`). */
  draft: VaneDraft | null;
};

type DraftDb = Pick<PrismaClient, "salesInvoice" | "salesQuotation">;

/** The draft a card is about, when its subject is an invoice or quote Vane made. Anything else is not a draft. */
export async function draftFor(
  db: DraftDb,
  companyId: string,
  subject: { type: string | null; id: string | null },
): Promise<VaneDraft | null> {
  if (!subject.id) return null;
  if (subject.type === "SalesInvoice") {
    const invoice = await db.salesInvoice.findFirst({
      where: { id: subject.id, companyId, madeByVane: true, status: "DRAFT" },
      select: { invoiceNumber: true, total: true, currency: true, dueDate: true, customer: { select: { name: true } }, _count: { select: { lines: true } } },
    });
    return invoice
      ? {
          number: invoice.invoiceNumber,
          kind: "invoice",
          customer: invoice.customer.name,
          lines: invoice._count.lines,
          total: Number(invoice.total),
          currency: invoice.currency,
          due: invoice.dueDate ? invoice.dueDate.toISOString().slice(0, 10) : null,
          href: "/books/invoices?view=drafts",
        }
      : null;
  }
  if (subject.type === "SalesQuotation") {
    const quote = await db.salesQuotation.findFirst({
      where: { id: subject.id, companyId, madeByVane: true, status: "DRAFT" },
      select: { quotationNumber: true, total: true, currency: true, validUntil: true, customer: { select: { name: true } }, _count: { select: { lines: true } } },
    });
    return quote
      ? {
          number: quote.quotationNumber,
          kind: "quote",
          customer: quote.customer.name,
          lines: quote._count.lines,
          total: Number(quote.total),
          currency: quote.currency,
          due: quote.validUntil ? quote.validUntil.toISOString().slice(0, 10) : null,
          href: "/crm/quotes",
        }
      : null;
  }
  return null;
}

/** One card this person can see, with the question behind it and what it read. Null when it is not theirs. */
export async function vaneCardDetail(db: Db & DraftDb, who: Who & { id: string }): Promise<VaneCardDetail | null> {
  const item = await db.vaneItem.findFirst({
    where: { id: who.id, companyId: who.companyId, kind: { in: FOR_YOU }, ...audienceFilter(who.userId, who.role) },
    select: {
      id: true,
      kind: true,
      sourceModule: true,
      headline: true,
      body: true,
      action: true,
      createdAt: true,
      status: true,
      sql: true,
      readFrom: true,
      subjectType: true,
      subjectId: true,
      job: { select: { id: true, label: true, finishedAt: true } },
    },
  });
  if (!item) return null;
  const readFrom = parseReadFrom(item.readFrom).map((entry) => ({ ...entry, ...tableLabel(entry.table) }));
  return {
    id: item.id,
    kind: item.kind === "ISSUE" ? "issue" : "suggestion",
    module: item.sourceModule,
    source: moduleName(item.sourceModule),
    headline: item.headline,
    body: item.body,
    action: parseAction(item.action),
    createdAt: item.createdAt.toISOString(),
    read: Boolean(item.sql?.trim()),
    status: item.status === "DONE" ? "done" : item.status === "MUTED" ? "muted" : "open",
    readFrom,
    sql: item.sql?.trim() || null,
    rows: Math.max(0, ...readFrom.map((entry) => entry.rows)),
    job: item.job ? { id: item.job.id, label: item.job.label, finishedAt: item.job.finishedAt?.toISOString() ?? null } : null,
    draft: await draftFor(db, who.companyId, { type: item.subjectType, id: item.subjectId }),
  };
}

// ---------------------------------------------------------------------------
// Plans (PageVanePlan).

export type VanePlanDetail = VanePlanCard & {
  status: "open" | "done" | "cancelled";
  createdAt: string;
  doneAt: string | null;
  /** The step that is next: the first not done, and whose it is. */
  current: { position: number; owner: "vane" | "person" } | null;
};

export function currentStep(steps: VanePlanCard["steps"]): VanePlanDetail["current"] {
  const index = steps.findIndex((step) => step.status !== "done");
  return index < 0 ? null : { position: index + 1, owner: steps[index]!.owner };
}

/** Every open plan, due soonest first, then the ones finished in the last 30 days. */
export async function vanePlans(db: Db, companyId: string, now: Date = new Date()): Promise<VanePlanDetail[]> {
  const plans = await db.vanePlan.findMany({
    where: {
      companyId,
      OR: [{ status: "OPEN" }, { status: "DONE", doneAt: { gte: new Date(now.getTime() - 30 * DAY_MS) } }],
    },
    orderBy: [{ dueOn: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
    take: 50,
    select: { id: true, title: true, dueOn: true, status: true, createdAt: true, doneAt: true, steps: STEP_SELECT },
  });
  const shaped = plans.map<VanePlanDetail>((plan) => {
    const card = planCard(plan);
    return {
      ...card,
      status: plan.status === "DONE" ? "done" : plan.status === "CANCELLED" ? "cancelled" : "open",
      createdAt: plan.createdAt.toISOString(),
      doneAt: plan.doneAt?.toISOString() ?? null,
      current: plan.status === "OPEN" ? currentStep(card.steps) : null,
    };
  });
  return [...shaped.filter((plan) => plan.status === "open"), ...shaped.filter((plan) => plan.status !== "open")];
}

// ---------------------------------------------------------------------------
// Done (PageVaneDone).

export const DONE_PERIODS = { today: 1, "7d": 7, "30d": 30 } as const;
export type DonePeriod = keyof typeof DONE_PERIODS;

export const doneQuerySchema = z.object({
  period: z.enum(["today", "7d", "30d"]).catch("7d"),
  /** "everyone", or "me": the jobs this person gave Vane. */
  who: z.enum(["everyone", "me"]).catch("everyone"),
  /** A job's kind ("nightly", "person"), or every kind. */
  kind: z.string().trim().max(60).nullish().catch(null),
});
export type DoneQuery = z.infer<typeof doneQuerySchema>;

export type VaneDoneRow = {
  id: string;
  at: string;
  text: string;
  kind: string;
  /** What a person did with what it raised: "Kept by James, 10:14", "Set aside by James", "Open". */
  next: { label: string; muted: boolean };
  /** What it read and cost: the tools it called and the tokens it spent. */
  cost: { tools: number; tokensIn: number; tokensOut: number };
};

export type VaneDone = {
  period: DonePeriod;
  who: "everyone" | "me";
  kind: string | null;
  /** The kinds of job there are, for the filter. */
  kinds: string[];
  days: Array<{ day: string; rows: VaneDoneRow[] }>;
  total: number;
  thisMonth: number;
  today: { done: number; takenFurther: number };
};

type NextItem = { status: "OPEN" | "DONE" | "MUTED"; resolvedAt: Date | null; resolvedBy: { name: string } | null };

/** What happened to what a job raised: kept beats set aside beats open. */
export function nextFor(items: NextItem[]): VaneDoneRow["next"] {
  const kept = items.find((item) => item.status === "DONE");
  if (kept) return { label: `Kept by ${firstName(kept.resolvedBy?.name)}${kept.resolvedAt ? `, ${clock(kept.resolvedAt)}` : ""}`, muted: false };
  const open = items.filter((item) => item.status === "OPEN").length;
  if (open) return { label: open === 1 ? "Open" : `${open} open`, muted: true };
  const muted = items.find((item) => item.status === "MUTED");
  if (muted) return { label: `Set aside by ${firstName(muted.resolvedBy?.name)}`, muted: true };
  return { label: "Nothing raised", muted: true };
}

function firstName(name: string | null | undefined): string {
  return name?.trim().split(/\s+/)[0] || "someone";
}

function clock(at: Date): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: SHOP_TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at);
}

export async function vaneDone(db: Db, who: Who & { query: DoneQuery }, now: Date = new Date()): Promise<VaneDone> {
  const { companyId, userId, query } = who;
  const days = DONE_PERIODS[query.period];
  const since = new Date(startOfShopDay(now).getTime() - (days - 1) * DAY_MS);
  const where: Prisma.VaneJobWhereInput = {
    companyId,
    status: "DONE",
    finishedAt: { gte: since },
    ...(query.who === "me" ? { requestedById: userId } : {}),
    ...(query.kind ? { kind: query.kind } : {}),
  };
  const today = startOfShopDay(now);
  const [jobs, kinds, thisMonth, doneToday, takenFurther] = await Promise.all([
    db.vaneJob.findMany({
      where,
      orderBy: { finishedAt: "desc" },
      take: 300,
      select: {
        id: true,
        kind: true,
        label: true,
        result: true,
        finishedAt: true,
        tools: true,
        tokensIn: true,
        tokensOut: true,
        items: { select: { status: true, resolvedAt: true, resolvedBy: { select: { name: true } } } },
      },
    }),
    db.vaneJob.findMany({ where: { companyId, status: "DONE" }, distinct: ["kind"], select: { kind: true }, orderBy: { kind: "asc" } }),
    db.vaneJob.count({ where: { companyId, status: "DONE", finishedAt: { gte: monthStart(now) } } }),
    db.vaneJob.count({ where: { companyId, status: "DONE", finishedAt: { gte: today } } }),
    db.vaneItem.count({ where: { companyId, status: "DONE", job: { finishedAt: { gte: today } } } }),
  ]);
  const byDay = new Map<string, VaneDoneRow[]>();
  for (const job of jobs) {
    const at = job.finishedAt ?? now;
    const day = shopDay(at);
    const rows = byDay.get(day) ?? [];
    rows.push({
      id: job.id,
      at: at.toISOString(),
      text: firstLine(job.result) || job.label,
      kind: job.kind,
      next: nextFor(job.items),
      cost: { tools: parseTools(job.tools).length, tokensIn: job.tokensIn, tokensOut: job.tokensOut },
    });
    byDay.set(day, rows);
  }
  return {
    period: query.period,
    who: query.who,
    kind: query.kind ?? null,
    kinds: kinds.map((row) => row.kind),
    days: [...byDay.entries()].map(([day, rows]) => ({ day, rows })),
    total: jobs.length,
    thisMonth,
    today: { done: doneToday, takenFurther },
  };
}

// ---------------------------------------------------------------------------
// Muted (PageVaneMuted).

export type VaneMutedRow = {
  id: string;
  headline: string;
  source: string;
  reason: string | null;
  by: string | null;
  at: string | null;
  /** This person stopped its kind: Vane no longer shows it to them. */
  stopped: boolean;
};

export type VaneMuted = {
  rows: VaneMutedRow[];
  /** The kind this person set aside often this month, when Vane may ask to stop showing it to them. */
  offer: StopOffer | null;
};

/**
 * The cards set aside that this person can see, newest first, with the
 * reason given; and the kind they set aside often enough this month that Vane
 * asks whether to stop showing it to them.
 */
export async function vaneMuted(db: Db, { companyId, userId, role }: Who, now: Date = new Date()): Promise<VaneMuted> {
  const [items, answered] = await Promise.all([
    db.vaneItem.findMany({
      where: { companyId, status: "MUTED", kind: { in: FOR_YOU }, ...audienceFilter(userId, role) },
      orderBy: { resolvedAt: { sort: "desc", nulls: "last" } },
      take: 200,
      select: {
        id: true,
        headline: true,
        sourceModule: true,
        action: true,
        mutedReason: true,
        resolvedAt: true,
        resolvedById: true,
        resolvedBy: { select: { name: true } },
      },
    }),
    db.vaneCardChoice.findMany({ where: { companyId, userId }, select: { cardKey: true, stopped: true } }),
  ]);
  const mine = items.filter((item) => item.resolvedById === userId);
  const offer = stopOffer(mine, new Set(answered.map((row) => row.cardKey)), monthStart(now));
  const stopped = new Set(answered.filter((row) => row.stopped).map((row) => row.cardKey));
  const rows = items.map((item) => ({
    id: item.id,
    headline: item.headline,
    source: moduleName(item.sourceModule),
    reason: item.mutedReason,
    by: item.resolvedBy ? firstName(item.resolvedBy.name) : null,
    at: item.resolvedAt?.toISOString() ?? null,
    stopped: stopped.has(cardKey(item)),
  }));
  return { rows, offer };
}
