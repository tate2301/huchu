import { randomUUID } from "node:crypto";

import type { PrismaClient } from "@prisma/client";
import { z } from "zod";

import { explainAboutSchema, explainQuestion, explainRequest, type ExplainAbout } from "./explain";
import { vaneState, type VaneState } from "./state";
import { audienceFilter, FOR_YOU, vaneStatus, type VaneStatus } from "./status";
import { notStopped } from "./stops";

/** The button on a For you card: it names the act and goes where the act is done. */
export const vaneActionSchema = z.object({
  type: z.enum(["open", "send", "review"]).default("open").catch("open"),
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
  source: string;
  headline: string;
  body: string;
  action: VaneAction | null;
  createdAt: string;
};

export type VanePlanCard = {
  id: string;
  title: string;
  dueOn: string | null;
  done: number;
  steps: Array<{ id: string; label: string; owner: "vane" | "person"; status: "todo" | "now" | "done"; progress: string | null }>;
};

export type VaneDone = { id: string; text: string; at: string };

export type VanePanel = {
  status: VaneStatus;
  /** Paused, over the allowance, unable to reach the service or to work out its last job (PageVaneStates). */
  state: VaneState | null;
  items: VaneCard[];
  plans: VanePlanCard[];
  done: VaneDone[];
};

type Db = Pick<PrismaClient, "vaneItem" | "vaneJob" | "vanePlan" | "vaneSettings" | "vaneCardChoice">;

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

function parseAction(value: unknown): VaneAction | null {
  const parsed = vaneActionSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * What the Vane panel shows: its state, the open For you cards (this module's
 * first), the plans still open, and what it finished in the last day.
 */
export async function vanePanel(
  db: Db,
  { companyId, userId, role, module }: { companyId: string; userId: string; role?: string | null; module?: string | null },
): Promise<VanePanel> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const stopped = await notStopped(db, companyId, userId);
  const [status, state, items, plans, done] = await Promise.all([
    vaneStatus(db, { companyId, userId, role }),
    vaneState(db, companyId),
    db.vaneItem.findMany({
      where: { companyId, status: "OPEN", kind: { in: FOR_YOU }, ...audienceFilter(userId, role), ...stopped },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, kind: true, sourceModule: true, headline: true, body: true, action: true, createdAt: true },
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
  ]);

  const cards = items.map<VaneCard>((item) => ({
    id: item.id,
    kind: item.kind === "ISSUE" ? "issue" : "suggestion",
    source: moduleName(item.sourceModule),
    headline: item.headline,
    body: item.body,
    action: parseAction(item.action),
    createdAt: item.createdAt.toISOString(),
  }));
  // This module's cards first, then the rest, each newest first.
  const here = module ? moduleName(module) : null;
  cards.sort((a, b) => Number(b.source === here) - Number(a.source === here));

  return {
    status,
    state,
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

/** A job's short name: the request's first line, cut at 120 characters. */
export function jobLabel(text: string): string {
  const line = text.trim().split(/\n/)[0]!.trim();
  return line.length > 120 ? `${line.slice(0, 119)}…` : line;
}

export const giveJobSchema = z.object({
  text: z.string().trim().min(3).max(2000),
  /** Explain a figure (PageVaneReport): the report and the figure the person pressed Explain on. */
  about: explainAboutSchema.optional(),
});

/**
 * Give Vane a job: queued for the worker as a person's job. The whole text is
 * the job's request, which the worker reads; the label is its first 120
 * characters, for Working on and the top bar.
 */
export async function giveVaneJob(
  db: Pick<PrismaClient, "vaneJob">,
  { companyId, userId, text, about }: { companyId: string; userId: string; text: string; about?: ExplainAbout },
) {
  // A figure explained is a job of its own kind: its label is the person's question, its request the
  // question with the report it is about (`explainRequest`).
  return db.vaneJob.create({
    data: {
      companyId,
      key: `${about ? "explain" : "person"}:${randomUUID()}`,
      kind: about ? "explain" : "person",
      label: jobLabel(about ? explainQuestion(about) : text),
      request: about ? explainRequest(about) : text,
      trigger: "PERSON",
      requestedById: userId,
      result: null,
      tools: [],
    },
    select: { id: true, label: true, status: true },
  });
}
