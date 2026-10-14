import type { PrismaClient } from "@prisma/client";
import { z } from "zod";

import { actionsFor, type VaneActionView } from "./actions/engine";
import { audienceFilter, FOR_YOU, vaneStatus, type VaneStatus } from "./status";

/** The button on a For you card: it names the act and goes where the act is done. */
export const vaneActionSchema = z.object({
  type: z.enum(["open", "send", "review"]).default("open"),
  label: z.string().min(1),
  shortcut: z.string().optional(),
  /** Where a person does it: the page, with the draft open. Vane never does it itself. */
  target: z.string().startsWith("/"),
  /** A second, quieter way in: "Read them first" beside "Send 3 reminders". */
  also: z.object({ label: z.string().min(1), target: z.string().startsWith("/") }).optional(),
});
export type VaneAction = z.infer<typeof vaneActionSchema>;

export type VaneCard = {
  id: string;
  kind: "issue" | "suggestion";
  /** The module it came from, as the app keys it: "books", "crm", "retail". */
  module: string;
  /** That module as the workspace names it: "Books", "Tender". */
  source: string;
  headline: string;
  body: string;
  action: VaneAction | null;
  createdAt: string;
  /** What it read, so a person can check it: each table and how many rows it gave. */
  read: Array<{ table: string; rows: number; about?: string }>;
  /** The question it ran. */
  sql: string | null;
  /** What Vane proposes to do about it, each waiting for a person's yes or no. */
  actions: VaneActionView[];
};

export type VanePlanCard = {
  id: string;
  title: string;
  dueOn: string | null;
  done: number;
  steps: Array<{ id: string; label: string; owner: "vane" | "person"; status: "todo" | "now" | "done"; progress: string | null }>;
};

export type VaneDone = { id: string; text: string; at: string };

/** A job Vane is on, or has waiting: "Reading the CBZ statement Rudo uploaded", "38 of 61". */
export type VaneWorking = { id: string; label: string; progress: string | null; running: boolean };

export type VanePanel = {
  status: VaneStatus;
  items: VaneCard[];
  plans: VanePlanCard[];
  done: VaneDone[];
  working: VaneWorking[];
};

type Db = Pick<PrismaClient, "vaneItem" | "vaneJob" | "vanePlan" | "vaneSettings" | "vaneAction">;

/** The modules the product names for a card's source. */
const MODULE_NAMES: Record<string, string> = {
  books: "Books",
  crm: "CRM",
  retail: "Tender",
  reports: "Reports",
  people: "People",
  payroll: "Payroll",
  schools: "Schools",
  gold: "Gold",
};

export function moduleName(source: string): string {
  return MODULE_NAMES[source] ?? source.charAt(0).toUpperCase() + source.slice(1);
}

const readSchema = z.array(
  z.object({ table: z.string().min(1), rows: z.number().int().nonnegative(), about: z.string().optional() }),
);

function parseRead(value: unknown): VaneCard["read"] {
  const parsed = readSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}

function parseAction(value: unknown): VaneAction | null {
  const parsed = vaneActionSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * What the Vane panel and `/vane` show: its state, the open For you cards
 * (this module's first, when there is one), the plans still open, the jobs
 * it is on, and what it finished since `doneSince` (the last day by default).
 */
export async function vanePanel(
  db: Db,
  {
    companyId,
    userId,
    role,
    module,
    doneSince,
  }: { companyId: string; userId: string; role?: string | null; module?: string | null; doneSince?: Date },
): Promise<VanePanel> {
  const since = doneSince ?? new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [status, items, plans, done, working] = await Promise.all([
    vaneStatus(db, { companyId, userId, role }),
    db.vaneItem.findMany({
      where: { companyId, status: "OPEN", kind: { in: FOR_YOU }, ...audienceFilter(userId, role) },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        kind: true,
        sourceModule: true,
        headline: true,
        body: true,
        action: true,
        createdAt: true,
        readFrom: true,
        sql: true,
      },
    }),
    db.vanePlan.findMany({
      where: { companyId, status: "OPEN" },
      orderBy: [{ dueOn: "asc" }, { createdAt: "desc" }],
      take: 5,
      select: {
        id: true,
        title: true,
        dueOn: true,
        steps: { orderBy: { position: "asc" }, select: { id: true, label: true, owner: true, status: true, progressLabel: true } },
      },
    }),
    db.vaneJob.findMany({
      where: { companyId, status: "DONE", finishedAt: { gte: since } },
      orderBy: { finishedAt: "desc" },
      take: 8,
      select: { id: true, label: true, result: true, finishedAt: true },
    }),
    db.vaneJob.findMany({
      where: { companyId, status: { in: ["RUNNING", "QUEUED", "WAITING"] } },
      orderBy: [{ startedAt: { sort: "desc", nulls: "last" } }, { runAfter: "asc" }],
      take: 6,
      select: { id: true, label: true, status: true, progressDone: true, progressTotal: true },
    }),
  ]);

  const { byItem } = await actionsFor(db, companyId, { itemIds: items.map((item) => item.id) });
  const cards = items.map<VaneCard>((item) => ({
    id: item.id,
    kind: item.kind === "ISSUE" ? "issue" : "suggestion",
    module: item.sourceModule,
    source: moduleName(item.sourceModule),
    headline: item.headline,
    body: item.body,
    action: parseAction(item.action),
    createdAt: item.createdAt.toISOString(),
    read: parseRead(item.readFrom),
    sql: item.sql,
    actions: byItem.get(item.id) ?? [],
  }));
  // This module's cards first, then the rest, each newest first.
  const here = module ? moduleName(module) : null;
  cards.sort((a, b) => Number(b.source === here) - Number(a.source === here));

  return {
    status,
    items: cards,
    plans: plans.map((plan) => ({
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
    })),
    done: done.map((job) => ({ id: job.id, text: job.result?.trim() || job.label, at: (job.finishedAt ?? new Date()).toISOString() })),
    working: working.map((job) => ({
      id: job.id,
      label: job.label,
      progress: job.progressTotal != null ? `${job.progressDone ?? 0} of ${job.progressTotal}` : null,
      running: job.status === "RUNNING",
    })),
  };
}

/** Not now: the card goes to Muted, with the reason when one is given. */
export async function muteVaneItem(
  db: Pick<PrismaClient, "vaneItem">,
  { companyId, userId, role, id, reason }: { companyId: string; userId: string; role?: string | null; id: string; reason?: string | null },
): Promise<boolean> {
  const { count } = await db.vaneItem.updateMany({
    where: { id, companyId, status: "OPEN", ...audienceFilter(userId, role) },
    data: { status: "MUTED", mutedReason: reason?.trim() || null, resolvedAt: new Date(), resolvedById: userId },
  });
  return count > 0;
}

/**
 * A person pressed the card's act: the card is done, with their name, and
 * they go on to the page where they finish it (send, issue, pay). Vane does
 * none of that; the card only records who took it further.
 */
export async function actOnVaneItem(
  db: Pick<PrismaClient, "vaneItem">,
  { companyId, userId, role, id }: { companyId: string; userId: string; role?: string | null; id: string },
): Promise<boolean> {
  const { count } = await db.vaneItem.updateMany({
    where: { id, companyId, status: "OPEN", ...audienceFilter(userId, role) },
    data: { status: "DONE", resolvedAt: new Date(), resolvedById: userId },
  });
  return count > 0;
}
