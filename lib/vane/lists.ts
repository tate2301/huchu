import type { PrismaClient } from "@prisma/client";

import { moduleName } from "./panel";
import { audienceFilter, FOR_YOU, jobLine, startOfWorkspaceDay } from "./status";
import { cardKey, showKindAgain, stoppedKeys } from "./stops";

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
  /** "waiting": laid out by Vane, nothing runs until a person presses Start. */
  status: "waiting" | "open" | "done";
  /** This person may press Start: it is their plan, or one no person asked for. */
  canStart: boolean;
  /** Whose plan it is, when someone else's: "Rudo". */
  whose: string | null;
  createdAt: string;
  doneAt: string | null;
  done: number;
  steps: VanePlanStepRow[];
};

const STEP_STATUS = { TODO: "todo", NOW: "now", DONE: "done" } as const;

const PLAN_ORDER = { open: 0, waiting: 1, done: 2 } as const;

/**
 * Plans under way first, soonest due; then those waiting for Start; then the
 * finished ones of the last 30 days, newest first.
 */
export async function listVanePlans(
  db: Pick<PrismaClient, "vanePlan">,
  { companyId, userId }: Who,
  now: Date = new Date(),
): Promise<VanePlanRow[]> {
  const rows = await db.vanePlan.findMany({
    where: {
      companyId,
      OR: [
        { status: { in: ["OPEN", "WAITING"] } },
        { status: "DONE", doneAt: { gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) } },
      ],
    },
    orderBy: [{ dueOn: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
    take: 50,
    include: {
      steps: { orderBy: { position: "asc" } },
      job: { select: { requestedById: true, requestedBy: { select: { name: true } } } },
    },
  });
  const plans = rows.map<VanePlanRow>((plan) => {
    const owner = plan.job?.requestedById ?? null;
    return {
      id: plan.id,
      title: plan.title,
      dueOn: plan.dueOn ? plan.dueOn.toISOString().slice(0, 10) : null,
      status: plan.status === "DONE" ? "done" : plan.status === "WAITING" ? "waiting" : "open",
      canStart: plan.status === "WAITING" && (!owner || owner === userId),
      whose: owner && owner !== userId ? (plan.job?.requestedBy?.name.trim().split(/\s+/)[0] ?? null) : null,
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
    };
  });
  // Finished plans newest first; the rest keep the soonest due first.
  return plans.sort(
    (a, b) => PLAN_ORDER[a.status] - PLAN_ORDER[b.status] || (a.status === "done" ? (b.doneAt ?? "").localeCompare(a.doneAt ?? "") : 0),
  );
}

/**
 * A person ticks one of their own steps, or unticks it. Vane's steps are
 * Vane's: a person cannot tick them, and no step moves before Start. When the
 * last step is ticked the plan is done; unticking one opens it again.
 */
export async function tickPlanStep(
  db: Pick<PrismaClient, "$transaction">,
  { companyId }: Who,
  { planId, stepId, done }: { planId: string; stepId: string; done: boolean },
  now: Date = new Date(),
): Promise<"ticked" | "not-found" | "vane-owns-it" | "not-started"> {
  return db.$transaction(async (tx) => {
    const step = await tx.vanePlanStep.findFirst({
      where: { id: stepId, planId, plan: { companyId, status: { not: "CANCELLED" } } },
      select: { id: true, owner: true, plan: { select: { status: true } } },
    });
    if (!step) return "not-found";
    if (step.owner === "VANE") return "vane-owns-it";
    // Nothing in a plan moves before a person presses Start.
    if (step.plan.status === "WAITING") return "not-started";
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
        what: job.result?.trim() || jobLine(job.label),
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
  source: string;
  reason: string | null;
  by: string | null;
  at: string | null;
  /** This person stopped its kind (Stop it for me): Vane no longer shows it to them. */
  stopped: boolean;
};

/** The cards this person can see that someone set aside, last set aside first. */
export async function listVaneMuted(db: Pick<PrismaClient, "vaneItem" | "vaneCardChoice">, who: Who): Promise<VaneMutedRow[]> {
  const [rows, stopped] = await Promise.all([
    db.vaneItem.findMany({
      where: { companyId: who.companyId, status: "MUTED", kind: { in: FOR_YOU }, ...audienceFilter(who.userId, who.role) },
      orderBy: { resolvedAt: "desc" },
      take: 200,
      select: {
        id: true,
        headline: true,
        sourceModule: true,
        action: true,
        mutedReason: true,
        resolvedAt: true,
        resolvedBy: { select: { name: true } },
      },
    }),
    stoppedKeys(db, who.companyId, who.userId).then((keys) => new Set(keys)),
  ]);
  return rows.map((row) => ({
    id: row.id,
    headline: row.headline,
    source: moduleName(row.sourceModule),
    reason: row.mutedReason,
    by: row.resolvedBy?.name ?? null,
    at: row.resolvedAt?.toISOString() ?? null,
    stopped: stopped.has(cardKey(row)),
  }));
}

/** Bring back: a muted card goes back to For you, and when this person had stopped its kind, the kind shows again. */
export async function unmuteVaneItem(db: Pick<PrismaClient, "vaneItem" | "vaneCardChoice">, who: Who & { id: string }): Promise<boolean> {
  const where = { id: who.id, companyId: who.companyId, status: "MUTED" as const, ...audienceFilter(who.userId, who.role) };
  const item = await db.vaneItem.findFirst({ where, select: { sourceModule: true, action: true } });
  if (!item) return false;
  const { count } = await db.vaneItem.updateMany({
    where,
    data: { status: "OPEN", mutedReason: null, resolvedAt: null, resolvedById: null },
  });
  if (count === 0) return false;
  await showKindAgain(db, { companyId: who.companyId, userId: who.userId, item });
  return true;
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
        label: jobLine(job.label),
        by: job.trigger === "PERSON" ? (job.requestedBy?.name ?? BY_TRIGGER.PERSON) : BY_TRIGGER[job.trigger],
        state,
        progress: job.progressTotal != null ? `${job.progressDone ?? 0} of ${job.progressTotal}` : null,
        since: (job.startedAt ?? job.createdAt).toISOString(),
        retryAt: state === "waiting" ? job.runAfter.toISOString() : null,
      } satisfies VaneWorkRow;
    })
    .sort((a, b) => order[a.state] - order[b.state]);
}
