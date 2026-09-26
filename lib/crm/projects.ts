/**
 * Projects: what a won deal turns into, and what its jobs belong to.
 *
 * The chain is deal -> project -> jobs. A job (`CrmWorkOrder`) is a crew, a
 * date and a checklist. That is the right shape for a morning's work and the
 * wrong shape for a six-week floor: nobody can say what the floor has cost so
 * far, because cost attaches to nothing. A project is that missing thing, and
 * the jobs are raised inside it.
 *
 * Every link it has — deal, client, site — is optional, because work is
 * sometimes raised directly and refusing to record it until the pipeline
 * catches up helps nobody. A deal has at most one project; a job has at most
 * one project, and can have none.
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
import { PROJECT_STATUSES } from "@/lib/crm/project-status";
import { payableAmount } from "@/lib/crm/requisitions";

type Tx = Prisma.TransactionClient;

const ZERO = new Prisma.Decimal(0);

export const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).nullable().optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
  dealId: z.string().uuid().nullable().optional(),
  clientId: z.string().uuid().nullable().optional(),
  siteId: z.string().uuid().nullable().optional(),
  managerId: z.string().uuid().nullable().optional(),
  startDate: z.coerce.date().nullable().optional(),
  targetEndDate: z.coerce.date().nullable().optional(),
  /** Null means nobody has set one, which is not the same as zero. */
  budget: z.number().finite().nonnegative().nullable().optional(),
  /**
   * Optional rather than defaulted: a project started from a deal takes the
   * deal's currency, and a default filled in by the parser would overwrite it
   * with USD before anything got the chance to ask the deal.
   */
  currency: z.string().trim().min(1).max(10).optional(),
  customFields: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const updateProjectSchema = createProjectSchema
  .partial()
  .extend({ actualEndDate: z.coerce.date().nullable().optional() });

export type CreateProjectInput = z.infer<typeof createProjectSchema>;

/**
 * The cost centre a project's spend is tagged with in the ledger.
 *
 * "Each project has its own accounting" is only true if a journal line can say
 * which project it belongs to, and `CostCenter` is the dimension this ledger
 * already has for exactly that. Created with the project and named after it,
 * so an accountant opening the cost-centre list recognises the work.
 *
 * Best-effort: a tenant whose accounting is not set up should still be able to
 * raise a project. A null cost centre costs project-level ledger reporting,
 * not the project.
 */
async function ensureProjectCostCentre(
  tx: Tx,
  companyId: string,
  projectNo: string,
  name: string,
): Promise<string | null> {
  try {
    const existing = await tx.costCenter.findFirst({
      where: { companyId, code: projectNo },
      select: { id: true },
    });
    if (existing) return existing.id;

    const created = await tx.costCenter.create({
      data: { companyId, code: projectNo, name: name.slice(0, 200) },
      select: { id: true },
    });
    return created.id;
  } catch {
    return null;
  }
}

/**
 * Raise a project, numbering it from the tenant's own sequence.
 *
 * Takes a transaction because the number, the cost centre and the project have
 * to land together or not at all — a reserved number with no project behind it
 * is a gap in the sequence somebody will ask about.
 */
export async function createProject(
  tx: Tx,
  companyId: string,
  createdById: string | null,
  input: CreateProjectInput,
) {
  const projectNo = await reserveIdentifier(tx, { companyId, entity: "CRM_PROJECT" });
  const costCenterId = await ensureProjectCostCentre(tx, companyId, projectNo, input.name);

  return tx.crmProject.create({
    data: {
      companyId,
      projectNo,
      costCenterId,
      name: input.name,
      description: input.description ?? null,
      status: input.status ?? "PLANNING",
      dealId: input.dealId ?? null,
      clientId: input.clientId ?? null,
      siteId: input.siteId ?? null,
      managerId: input.managerId ?? null,
      startDate: input.startDate ?? null,
      targetEndDate: input.targetEndDate ?? null,
      budget: input.budget === null || input.budget === undefined ? null : new Prisma.Decimal(input.budget),
      currency: input.currency ?? "USD",
      customFields: (input.customFields ?? undefined) as Prisma.InputJsonValue | undefined,
      createdById,
    },
  });
}

/** A deal, job or project the caller named that is not in this tenant. */
export class ProjectLinkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectLinkError";
  }
}

/**
 * Start the project a won deal turns into.
 *
 * Carries across what the deal already knows — its name, its client and site,
 * and its owner as the person answerable for the budget — rather than asking
 * anybody to retype it. The deal's value is not copied: it stays on the deal
 * and the project reads it from there as the reference its budget is set
 * against, so a value corrected on the deal is corrected everywhere.
 *
 * Idempotent on the deal. One project per deal is the rule the schema
 * enforces; a second request — a double-tap on a bad connection, a colleague
 * who got there first — is handed the project that exists rather than an
 * error, because from where they stand that is what they asked for.
 */
export async function projectFromDeal(
  tx: Tx,
  companyId: string,
  createdById: string | null,
  dealId: string,
  overrides: Partial<CreateProjectInput> = {},
) {
  const existing = await tx.crmProject.findFirst({ where: { companyId, dealId } });
  if (existing) return existing;

  const deal = await tx.crmDeal.findFirst({
    where: { id: dealId, companyId },
    select: {
      id: true,
      title: true,
      clientId: true,
      siteId: true,
      assignedToId: true,
      currency: true,
    },
  });
  if (!deal) throw new ProjectLinkError("Deal not found");

  return createProject(tx, companyId, createdById, {
    name: deal.title,
    clientId: deal.clientId,
    siteId: deal.siteId,
    managerId: deal.assignedToId,
    currency: deal.currency,
    ...definedOnly(overrides),
    // Whatever else was overridden, this is the deal's project.
    dealId: deal.id,
  });
}

/**
 * The keys somebody actually sent.
 *
 * An override of `undefined` means "not mentioned", and spreading it over the
 * deal's own values would blank the client because a form left a field out.
 * `null` is kept: that is somebody saying "no owner", which is an answer.
 */
function definedOnly<T extends Record<string, unknown>>(values: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

/**
 * What a job raised inside a project hangs off.
 *
 * A job in a project is for that project's deal, client and site, so those
 * are filled from the project wherever the request left them blank — the
 * sheet opened from a project sends nothing but the project, and the job still
 * lands on the deal it will be invoiced against and on the customer's record.
 *
 * A request that names a *different* deal is refused rather than quietly
 * corrected: a job billed against one deal and costed against another's
 * project is two records that each tell half the story.
 */
export async function jobLinksFromProject(
  tx: Tx,
  companyId: string,
  projectId: string,
  given: { dealId?: string | null; clientId?: string | null; siteId?: string | null },
): Promise<{ projectId: string; dealId: string | null; clientId: string | null; siteId: string | null }> {
  const project = await tx.crmProject.findFirst({
    where: { id: projectId, companyId },
    select: { id: true, dealId: true, clientId: true, siteId: true },
  });
  if (!project) throw new ProjectLinkError("Project not found");

  if (given.dealId && project.dealId && given.dealId !== project.dealId) {
    throw new ProjectLinkError("That project belongs to a different deal");
  }

  return {
    projectId: project.id,
    dealId: given.dealId ?? project.dealId,
    clientId: given.clientId ?? project.clientId,
    siteId: given.siteId ?? project.siteId,
  };
}

/**
 * Projects whose spend has gone past their budget.
 *
 * Asked of the database in one grouped sum rather than by running the full
 * rollup per project: this is a filter over the whole register, and the
 * register filters before it pages. Spend is plain cost entries — no cut
 * approvals to resolve — so the SQL sum and `projectCostSummary` are the
 * same arithmetic, and a project with no budget is never over it.
 */
export async function overBudgetProjectIds(tx: Tx, companyId: string): Promise<string[]> {
  const spend = await tx.crmDailyCostEntry.groupBy({
    by: ["projectId"],
    where: { companyId, direction: "SPENT", projectId: { not: null } },
    _sum: { amount: true },
  });
  const spentByProject = new Map(
    spend.map((row) => [row.projectId as string, row._sum.amount ?? ZERO]),
  );
  if (spentByProject.size === 0) return [];

  const budgeted = await tx.crmProject.findMany({
    where: { companyId, id: { in: [...spentByProject.keys()] }, budget: { not: null } },
    select: { id: true, budget: true },
  });

  return budgeted
    .filter((project) => spentByProject.get(project.id)!.greaterThan(project.budget!))
    .map((project) => project.id);
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
