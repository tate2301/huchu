import type { PrismaClient } from "@prisma/client";

import { moduleName } from "./panel";
import { audienceFilter, FOR_YOU, startOfWorkspaceDay } from "./status";

/**
 * Vane's three lists (`/vane/plans`, `/vane/done`, `/vane/muted`): its plans
 * and their steps, what it did a day at a time and what people did next, and
 * the cards people set aside. Read for one person: cards for another role or
 * another person are not theirs.
 */

type Who = { companyId: string; userId: string; role?: string | null };

/* ─────────────────────────────── Plans ─────────────────────────────── */

export type VanePlanStepRow = {
  id: string;
  position: number;
  label: string;
  owner: "vane" | "person";
  status: "todo" | "now" | "done";
  /** "38 of 61 lines". */
  progress: string | null;
};

export type VanePlanRow = {
  id: string;
  title: string;
  dueOn: string | null;
  status: "open" | "done";
  createdAt: string;
  doneAt: string | null;
  done: number;
  steps: VanePlanStepRow[];
};

const STEP_STATUS = { TODO: "todo", NOW: "now", DONE: "done" } as const;

/** Open plans first, soonest due; then the finished ones of the last 30 days, newest first. */
export async function listVanePlans(db: Pick<PrismaClient, "vanePlan">, { companyId }: Who, now: Date = new Date()): Promise<VanePlanRow[]> {
  const rows = await db.vanePlan.findMany({
    where: {
      companyId,
      OR: [{ status: "OPEN" }, { status: "DONE", doneAt: { gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) } }],
    },
    orderBy: [{ status: "asc" }, { dueOn: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
    take: 50,
    include: { steps: { orderBy: { position: "asc" } } },
  });
  return rows.map((plan) => ({
    id: plan.id,
    title: plan.title,
    dueOn: plan.dueOn ? plan.dueOn.toISOString().slice(0, 10) : null,
    status: plan.status === "DONE" ? "done" : "open",
    createdAt: plan.createdAt.toISOString(),
    doneAt: plan.doneAt?.toISOString() ?? null,
    done: plan.steps.filter((step) => step.status === "DONE").length,
    steps: plan.steps.map((step) => ({
      id: step.id,
      position: step.position,
      label: step.label,
      owner: step.owner === "VANE" ? "vane" : "person",
      status: STEP_STATUS[step.status],
      progress: step.progressLabel,
    })),
  }));
}

/**
 * A person ticks one of their own steps, or unticks it. Vane's steps are
 * Vane's: a person cannot tick them. When the last step is ticked the plan is
 * done; unticking one opens it again.
 */
export async function tickPlanStep(
  db: Pick<PrismaClient, "$transaction">,
  { companyId }: Who,
  { planId, stepId, done }: { planId: string; stepId: string; done: boolean },
  now: Date = new Date(),
): Promise<"ticked" | "not-found" | "vane-owns-it"> {
  return db.$transaction(async (tx) => {
    const step = await tx.vanePlanStep.findFirst({
      where: { id: stepId, planId, plan: { companyId, status: { not: "CANCELLED" } } },
      select: { id: true, owner: true },
    });
    if (!step) return "not-found";
    if (step.owner === "VANE") return "vane-owns-it";
    await tx.vanePlanStep.update({
      where: { id: step.id },
      data: done ? { status: "DONE", doneAt: now } : { status: "TODO", doneAt: null },
    });
    const left = await tx.vanePlanStep.count({ where: { planId, status: { not: "DONE" } } });
    await tx.vanePlan.update({
      where: { id: planId },
      data: left === 0 ? { status: "DONE", doneAt: now } : { status: "OPEN", doneAt: null },
    });
    return "ticked";
  });
}

/**
 * Vane moves one of its own steps on as its work goes: Now while it works
 * on it, with how far it is ("38 of 61 lines"), and Done when finished. A
 * person's steps are theirs to tick. When the last step is done the plan is.
 */
export async function moveVaneStep(
  db: Pick<PrismaClient, "$transaction">,
  { companyId }: { companyId: string },
  { planId, stepId, status, progress }: { planId: string; stepId: string; status: "NOW" | "DONE"; progress?: string | null },
  now: Date = new Date(),
): Promise<"moved" | "not-found" | "person-owns-it"> {
  return db.$transaction(async (tx) => {
    const step = await tx.vanePlanStep.findFirst({
      where: { id: stepId, planId, plan: { companyId, status: { not: "CANCELLED" } } },
      select: { id: true, owner: true },
    });
    if (!step) return "not-found";
    if (step.owner !== "VANE") return "person-owns-it";
    await tx.vanePlanStep.update({
      where: { id: step.id },
      data: status === "DONE" ? { status: "DONE", doneAt: now, progressLabel: progress ?? null } : { status: "NOW", progressLabel: progress ?? null },
    });
    const left = await tx.vanePlanStep.count({ where: { planId, status: { not: "DONE" } } });
    await tx.vanePlan.update({ where: { id: planId }, data: left === 0 ? { status: "DONE", doneAt: now } : { status: "OPEN", doneAt: null } });
    return "moved";
  });
}

/* ─────────────────────────────── Done ──────────────────────────────── */

export type VaneDoneRow = {
  id: string;
  at: string;
  /** "Found 3 invoices past their terms", "Matched 3 bank lines". */
  what: string;
  /** The job's kind: "nightly", "person". */
  template: string;
  /** What happened next: "Open", "Send 3 reminders, by James, 10:14", "Not now: Already done". */
  next: string;
  /** Someone took it further. */
  taken: boolean;
  /** A card's id, to open it; a finished job that raised no card has none. */
  cardId: string | null;
};

export type VaneDoneDay = { day: string; rows: VaneDoneRow[] };

export type VaneDoneView = {
  days: VaneDoneDay[];
  /** Everything Vane did in the period, and what people took further. */
  total: number;
  taken: number;
  /** Jobs finished in the period and this month. */
  jobs: { period: number; month: number };
  /** The job kinds that ran in the period, for the filter. */
  templates: string[];
};

const time = (date: Date) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Harare", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date);
const dayOf = (date: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Harare", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);

/** What became of a card, in a line. */
export function cardOutcome(card: {
  status: "OPEN" | "DONE" | "MUTED";
  mutedReason: string | null;
  resolvedAt: Date | null;
  resolvedBy: { name: string } | null;
  actionLabel: string | null;
}): string {
  if (card.status === "OPEN") return "Open";
  const who = card.resolvedBy?.name ?? "someone";
  const when = card.resolvedAt ? `, ${time(card.resolvedAt)}` : "";
  if (card.status === "MUTED") return `Not now${card.mutedReason ? `: ${card.mutedReason}` : ""}, ${who}${when}`;
  return `${card.actionLabel ?? "Taken further"}, by ${who}${when}`;
}

/**
 * Done (`/vane/done`): the cards Vane raised and the jobs it finished without
 * raising one, a day at a time, newest first, over the last `days` days (1 is
 * today), each with what happened next.
 */
export async function listVaneDone(
  db: Pick<PrismaClient, "vaneItem" | "vaneJob">,
  who: Who,
  { days, template }: { days: number; template?: string | null },
  now: Date = new Date(),
): Promise<VaneDoneView> {
  const from = new Date(startOfWorkspaceDay(now).getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const jobWhere = { companyId: who.companyId, status: "DONE" as const, finishedAt: { gte: from } };

  const [cards, jobs, period, month, kinds] = await Promise.all([
    db.vaneItem.findMany({
      where: {
        companyId: who.companyId,
        kind: { in: FOR_YOU },
        createdAt: { gte: from },
        ...(template ? { job: { kind: template } } : {}),
        ...audienceFilter(who.userId, who.role),
      },
      orderBy: { createdAt: "desc" },
      take: 300,
      select: {
        id: true,
        headline: true,
        sourceModule: true,
        status: true,
        mutedReason: true,
        resolvedAt: true,
        action: true,
        createdAt: true,
        resolvedBy: { select: { name: true } },
        job: { select: { kind: true } },
      },
    }),
    db.vaneJob.findMany({
      where: { ...jobWhere, items: { none: {} }, ...(template ? { kind: template } : {}) },
      orderBy: { finishedAt: "desc" },
      take: 300,
      select: { id: true, kind: true, label: true, result: true, finishedAt: true, requestedBy: { select: { name: true } } },
    }),
    db.vaneJob.count({ where: jobWhere }),
    db.vaneJob.count({ where: { companyId: who.companyId, status: "DONE", finishedAt: { gte: monthStart } } }),
    db.vaneJob.findMany({ where: jobWhere, distinct: ["kind"], select: { kind: true } }),
  ]);

  const rows: Array<VaneDoneRow & { at: string }> = [
    ...cards.map((card) => {
      const action = card.action && typeof card.action === "object" && !Array.isArray(card.action) ? (card.action as { label?: unknown }) : null;
      return {
        id: card.id,
        at: card.createdAt.toISOString(),
        what: card.headline,
        template: card.job?.kind ?? moduleName(card.sourceModule),
        next: cardOutcome({
          status: card.status,
          mutedReason: card.mutedReason,
          resolvedAt: card.resolvedAt,
          resolvedBy: card.resolvedBy,
          actionLabel: typeof action?.label === "string" ? action.label : null,
        }),
        taken: card.status === "DONE",
        cardId: card.id,
      };
    }),
    ...jobs.map((job) => {
      const at = job.finishedAt ?? now;
      return {
        id: job.id,
        at: at.toISOString(),
        what: job.result?.trim() || job.label,
        template: job.kind,
        next: job.requestedBy ? `Done for ${job.requestedBy.name}` : "Nothing to raise",
        taken: false,
        cardId: null,
      };
    }),
  ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

  const byDay = new Map<string, VaneDoneRow[]>();
  for (const row of rows) {
    const day = dayOf(new Date(row.at));
    byDay.set(day, [...(byDay.get(day) ?? []), row]);
  }

  return {
    days: [...byDay].map(([day, dayRows]) => ({ day, rows: dayRows })),
    total: rows.length,
    taken: rows.filter((row) => row.taken).length,
    jobs: { period, month },
    templates: kinds.map((kind) => kind.kind).sort(),
  };
}

/* ─────────────────────────────── Muted ─────────────────────────────── */

export type VaneMutedRow = {
  id: string;
  headline: string;
  /** What kind of card it was, as Vane named it: "Short cash-up". */
  topic: string | null;
  source: string;
  reason: string | null;
  by: string | null;
  at: string | null;
};

/** The cards this person can see that someone set aside, last set aside first. */
export async function listVaneMuted(db: Pick<PrismaClient, "vaneItem">, who: Who): Promise<VaneMutedRow[]> {
  const rows = await db.vaneItem.findMany({
    where: { companyId: who.companyId, status: "MUTED", kind: { in: FOR_YOU }, ...audienceFilter(who.userId, who.role) },
    orderBy: { resolvedAt: "desc" },
    take: 200,
    select: { id: true, headline: true, topic: true, sourceModule: true, mutedReason: true, resolvedAt: true, resolvedBy: { select: { name: true } } },
  });
  return rows.map((row) => ({
    id: row.id,
    headline: row.headline,
    topic: row.topic,
    source: moduleName(row.sourceModule),
    reason: row.mutedReason,
    by: row.resolvedBy?.name ?? null,
    at: row.resolvedAt?.toISOString() ?? null,
  }));
}

/** Bring back: a muted card goes back to For you. */
export async function unmuteVaneItem(db: Pick<PrismaClient, "vaneItem">, who: Who & { id: string }): Promise<boolean> {
  const { count } = await db.vaneItem.updateMany({
    where: { id: who.id, companyId: who.companyId, status: "MUTED", ...audienceFilter(who.userId, who.role) },
    data: { status: "OPEN", mutedReason: null, resolvedAt: null, resolvedById: null },
  });
  return count > 0;
}

/* ───────────────────────────── Working on ──────────────────────────── */

export type VaneWorkRow = {
  id: string;
  /** The job, as the person asked it or as Vane named it. */
  label: string;
  /** Who set it going: a person's name, or when Vane did. */
  by: string;
  state: "running" | "next" | "waiting";
  /** "38 of 61". */
  progress: string | null;
  /** When it started, or when it was queued. */
  since: string;
  /** A waiting job's next try. */
  retryAt: string | null;
};

const BY_TRIGGER = { NIGHTLY: "Vane, at 06:00", SCHEDULE: "Vane, on schedule", RECORD: "Vane, on a change", PERSON: "A person" } as const;

/** Working on (`/vane/working`): the jobs running now, then those queued, then those waiting to try again. */
export async function listVaneWorking(db: Pick<PrismaClient, "vaneJob">, { companyId }: Who): Promise<VaneWorkRow[]> {
  const rows = await db.vaneJob.findMany({
    where: { companyId, status: { in: ["RUNNING", "QUEUED", "WAITING"] } },
    orderBy: [{ runAfter: "asc" }, { createdAt: "asc" }],
    take: 100,
    select: {
      id: true,
      label: true,
      trigger: true,
      status: true,
      progressDone: true,
      progressTotal: true,
      startedAt: true,
      createdAt: true,
      runAfter: true,
      requestedBy: { select: { name: true } },
    },
  });
  const order = { running: 0, next: 1, waiting: 2 } as const;
  return rows
    .map((job) => {
      const state = job.status === "RUNNING" ? "running" : job.status === "WAITING" ? "waiting" : "next";
      return {
        id: job.id,
        label: job.label,
        by: job.trigger === "PERSON" ? (job.requestedBy?.name ?? BY_TRIGGER.PERSON) : BY_TRIGGER[job.trigger],
        state,
        progress: job.progressTotal != null ? `${job.progressDone ?? 0} of ${job.progressTotal}` : null,
        since: (job.startedAt ?? job.createdAt).toISOString(),
        retryAt: state === "waiting" ? job.runAfter.toISOString() : null,
      } satisfies VaneWorkRow;
    })
    .sort((a, b) => order[a.state] - order[b.state]);
}
