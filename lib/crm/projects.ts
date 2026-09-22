/**
 * Projects: what a job belongs to when the work runs longer than a day.
 *
 * The pipeline already runs lead -> qualified -> ... -> raise job, and then
 * stops. A job (`CrmWorkOrder`) is a crew, a date and a checklist. That is the
 * right shape for a morning's work and the wrong shape for a six-week floor:
 * nobody can say what the floor has cost so far, because cost attaches to
 * nothing.
 *
 * A project is that missing thing. Every link it has — deal, client, site,
 * work order — is optional, because work is sometimes raised directly and
 * refusing to record it until the pipeline catches up helps nobody.
 *
 * The rollup here is the question people actually ask: what has this cost, and
 * how much of it is still out in somebody's pocket. It reads two sources and
 * keeps them apart on purpose:
 *
 *   committed   approved and disbursed requisitions — money promised or gone
 *   spent       daily cost entries — money accounted for against the work
 *
 * Adding them would double-count a requisition that was drawn and then spent.
 * Showing only one hides either the float or the cash bought from the till.
 */

import { Prisma } from "@prisma/client";
import { z } from "zod";

import { reserveIdentifier } from "@/lib/id-generator";
import { payableAmount } from "@/lib/crm/requisitions";

type Tx = Prisma.TransactionClient;

export const PROJECT_STATUSES = [
  "PLANNING",
  "ACTIVE",
  "ON_HOLD",
  "COMPLETED",
  "CANCELLED",
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  PLANNING: "Planning",
  ACTIVE: "Active",
  ON_HOLD: "On hold",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

/**
 * Which moves are allowed.
 *
 * A completed project can be reopened — unlike a completed job, which carries
 * a signature against work that was done on a particular day. A project is a
 * container, and a snag list arriving a fortnight later is the same project,
 * not a new one. Cancelled is final: cancelling is a decision, and undoing it
 * quietly would lose the fact that it was ever made.
 */
const TRANSITIONS: Record<ProjectStatus, readonly ProjectStatus[]> = {
  PLANNING: ["ACTIVE", "ON_HOLD", "CANCELLED"],
  ACTIVE: ["ON_HOLD", "COMPLETED", "CANCELLED"],
  ON_HOLD: ["ACTIVE", "COMPLETED", "CANCELLED"],
  COMPLETED: ["ACTIVE"],
  CANCELLED: [],
};

export function canTransition(from: ProjectStatus, to: ProjectStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function allowedTransitions(from: ProjectStatus): readonly ProjectStatus[] {
  return TRANSITIONS[from];
}

export class ProjectTransitionError extends Error {
  constructor(from: ProjectStatus, to: ProjectStatus) {
    super(
      TRANSITIONS[from].length === 0
        ? `A ${PROJECT_STATUS_LABELS[from].toLowerCase()} project cannot be changed.`
        : `A ${PROJECT_STATUS_LABELS[from].toLowerCase()} project can only move to ${TRANSITIONS[
            from
          ]
            .map((status) => PROJECT_STATUS_LABELS[status].toLowerCase())
            .join(" or ")}, not ${PROJECT_STATUS_LABELS[to].toLowerCase()}.`,
    );
    this.name = "ProjectTransitionError";
  }
}

export function assertTransition(from: ProjectStatus, to: ProjectStatus): void {
  if (!canTransition(from, to)) throw new ProjectTransitionError(from, to);
}

/** A project is done taking new cost once it is closed one way or the other. */
export function isClosed(status: ProjectStatus): boolean {
  return status === "COMPLETED" || status === "CANCELLED";
}

export const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).nullable().optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
  dealId: z.string().uuid().nullable().optional(),
  clientId: z.string().uuid().nullable().optional(),
  siteId: z.string().uuid().nullable().optional(),
  workOrderId: z.string().uuid().nullable().optional(),
  managerId: z.string().uuid().nullable().optional(),
  startDate: z.coerce.date().nullable().optional(),
  targetEndDate: z.coerce.date().nullable().optional(),
  /** Null means nobody has set one, which is not the same as zero. */
  budget: z.number().finite().nonnegative().nullable().optional(),
  currency: z.string().trim().min(1).max(10).default("USD"),
  customFields: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const updateProjectSchema = createProjectSchema
  .partial()
  .extend({ actualEndDate: z.coerce.date().nullable().optional() });

export type CreateProjectInput = z.infer<typeof createProjectSchema>;

/**
 * Raise a project, numbering it from the tenant's own sequence.
 *
 * Takes a transaction because the caller usually has other work to do in the
 * same breath — attaching the job that prompted it, most often.
 */
export async function createProject(
  tx: Tx,
  companyId: string,
  createdById: string | null,
  input: CreateProjectInput,
) {
  const projectNo = await reserveIdentifier(tx, { companyId, entity: "CRM_PROJECT" });

  return tx.crmProject.create({
    data: {
      companyId,
      projectNo,
      name: input.name,
      description: input.description ?? null,
      status: input.status ?? "PLANNING",
      dealId: input.dealId ?? null,
      clientId: input.clientId ?? null,
      siteId: input.siteId ?? null,
      workOrderId: input.workOrderId ?? null,
      managerId: input.managerId ?? null,
      startDate: input.startDate ?? null,
      targetEndDate: input.targetEndDate ?? null,
      budget: input.budget === null || input.budget === undefined ? null : new Prisma.Decimal(input.budget),
      currency: input.currency,
      customFields: (input.customFields ?? undefined) as Prisma.InputJsonValue | undefined,
      createdById,
    },
  });
}

/**
 * Raise a project from a job that has outgrown being a job.
 *
 * Carries the job's client, site and deal across rather than asking the user
 * to retype what the system already knows, and names the project after the
 * job so the two are recognisable as the same piece of work.
 */
export async function projectFromWorkOrder(
  tx: Tx,
  companyId: string,
  createdById: string | null,
  workOrderId: string,
  overrides: Partial<CreateProjectInput> = {},
) {
  const workOrder = await tx.crmWorkOrder.findFirst({
    where: { id: workOrderId, companyId },
    select: {
      id: true,
      title: true,
      clientId: true,
      siteId: true,
      dealId: true,
      assignedToId: true,
      scheduledStart: true,
    },
  });
  if (!workOrder) throw new Error("Job not found");

  // One project per job. Raising it twice from a double-tap should hand back
  // the same project rather than splitting the costs across two.
  const existing = await tx.crmProject.findFirst({ where: { companyId, workOrderId } });
  if (existing) return existing;

  return createProject(tx, companyId, createdById, {
    name: workOrder.title,
    clientId: workOrder.clientId,
    siteId: workOrder.siteId,
    dealId: workOrder.dealId,
    workOrderId: workOrder.id,
    managerId: workOrder.assignedToId,
    startDate: workOrder.scheduledStart,
    currency: "USD",
    ...overrides,
  });
}

/** The money side of one project, in the shape the header strip reads. */
export type ProjectCostSummary = {
  /** Approved but not yet paid. The claim on next week's bank balance. */
  approved: Prisma.Decimal;
  /** Paid out and not yet accounted for. Somebody is holding this. */
  outstanding: Prisma.Decimal;
  /** Everything approved or paid, whether or not it has been acquitted. */
  committed: Prisma.Decimal;
  /** Accounted for against the work, from the daily logs. */
  spent: Prisma.Decimal;
  /** Money that came in against the project — a deposit paid on site. */
  received: Prisma.Decimal;
  budget: Prisma.Decimal | null;
  /** Budget minus spend. Null when nobody has set a budget. */
  remaining: Prisma.Decimal | null;
  currency: string;
};

const ZERO = new Prisma.Decimal(0);

function sum(values: Array<Prisma.Decimal | null>): Prisma.Decimal {
  return values.reduce<Prisma.Decimal>(
    (total, value) => (value === null ? total : total.plus(value)),
    ZERO,
  );
}

/**
 * What a project has cost.
 *
 * Deliberately four numbers rather than one. "Spent" alone answers the
 * accountant and not the manager, who needs to know what is already promised
 * before approving the next request. Reading the requisitions row by row
 * rather than with `aggregate` because a cut approval means the payable figure
 * is `approvedAmount ?? amount`, which SQL cannot express as one sum without
 * repeating the rule — and a rule repeated in two places drifts.
 */
export async function projectCostSummary(
  tx: Tx,
  companyId: string,
  projectId: string,
): Promise<ProjectCostSummary> {
  const project = await tx.crmProject.findFirst({
    where: { id: projectId, companyId },
    select: { budget: true, currency: true },
  });
  if (!project) throw new Error("Project not found");

  const requisitions = await tx.crmRequisition.findMany({
    where: {
      companyId,
      projectId,
      status: { in: ["APPROVED", "DISBURSED", "ACQUITTED"] },
    },
    select: { status: true, amount: true, approvedAmount: true, acquittedAmount: true },
  });

  let approved = ZERO;
  let outstanding = ZERO;
  let committed = ZERO;

  for (const requisition of requisitions) {
    const payable = payableAmount(requisition);
    committed = committed.plus(payable);
    if (requisition.status === "APPROVED") approved = approved.plus(payable);
    if (requisition.status === "DISBURSED") outstanding = outstanding.plus(payable);
  }

  const entries = await tx.crmDailyCostEntry.findMany({
    where: { companyId, projectId },
    select: { direction: true, amount: true },
  });

  const spent = sum(entries.filter((e) => e.direction === "SPENT").map((e) => e.amount));
  const received = sum(entries.filter((e) => e.direction === "RECEIVED").map((e) => e.amount));

  return {
    approved,
    outstanding,
    committed,
    spent,
    received,
    budget: project.budget,
    remaining: project.budget === null ? null : project.budget.minus(spent),
    currency: project.currency,
  };
}

/**
 * Whether a budget has been overrun, and by how much.
 *
 * Returns null when there is no budget rather than pretending zero: a project
 * nobody has budgeted is not a project that is over budget by its whole cost.
 */
export function budgetOverrun(summary: ProjectCostSummary): Prisma.Decimal | null {
  if (summary.budget === null) return null;
  const over = summary.spent.minus(summary.budget);
  return over.greaterThan(0) ? over : null;
}
