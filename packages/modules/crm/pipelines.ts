/**
 * Configurable deal pipelines.
 *
 * Stages are data rather than code, but every pipeline still resolves to the
 * three protected outcomes in CrmDealStatus. A pipeline is only valid with
 * exactly one WON stage and one LOST stage — otherwise a deal could be moved
 * somewhere that leaves "did we win this?" unanswerable.
 */
import type { CrmDealStatus, Prisma } from "@corelithzw/db";
import { z } from "zod";

export type Tx = Prisma.TransactionClient;

export const DEFAULT_PIPELINE_NAME = "Sales and Site Visits";

export type StageTemplate = {
  name: string;
  status: CrmDealStatus;
  probability: number;
  colorToken?: string;
  requiresSiteVisit?: boolean;
  requiresQuotation?: boolean;
  inactivityDays?: number;
  checklist?: Array<{ key: string; label: string }>;
};

/**
 * The stages the CRM shipped with, kept as the out-of-the-box template so an
 * existing pipeline reads exactly as it did before it became configurable.
 */
export const DEFAULT_STAGE_TEMPLATE: StageTemplate[] = [
  {
    name: "New",
    status: "OPEN",
    probability: 10,
    inactivityDays: 3,
    checklist: [
      { key: "contact_attempted", label: "Attempt first contact" },
      { key: "enquiry_understood", label: "Understand what they are asking for" },
    ],
  },
  {
    name: "Contacted",
    status: "OPEN",
    probability: 20,
    inactivityDays: 7,
    checklist: [
      { key: "need_confirmed", label: "Confirm the need is real" },
      { key: "timeline_discussed", label: "Discuss their timeline" },
    ],
  },
  {
    name: "Qualified",
    status: "OPEN",
    probability: 40,
    inactivityDays: 10,
    checklist: [
      { key: "budget", label: "Confirm budget" },
      { key: "decision_maker", label: "Confirm the decision-maker" },
      { key: "site", label: "Confirm the site" },
      { key: "close_date", label: "Set an expected close date" },
    ],
  },
  {
    name: "Site visit",
    status: "OPEN",
    probability: 55,
    requiresSiteVisit: true,
    inactivityDays: 14,
    checklist: [
      { key: "visit_booked", label: "Book the visit" },
      { key: "visit_written_up", label: "Write the visit up with measurements" },
    ],
  },
  {
    name: "Quoted",
    status: "OPEN",
    probability: 70,
    requiresQuotation: true,
    inactivityDays: 7,
    checklist: [
      { key: "quote_sent", label: "Send the quotation" },
      { key: "quote_followed_up", label: "Follow up on the quotation" },
    ],
  },
  {
    name: "Invoiced",
    status: "OPEN",
    probability: 90,
    inactivityDays: 14,
    checklist: [{ key: "payment_terms", label: "Agree payment terms" }],
  },
  { name: "Won", status: "WON", probability: 100, colorToken: "status-success-border" },
  { name: "Lost", status: "LOST", probability: 0, colorToken: "status-error-border" },
];

export const stageInputSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(60),
  status: z.enum(["OPEN", "WON", "LOST"]).default("OPEN"),
  probability: z.number().int().min(0).max(100).default(0),
  colorToken: z.string().trim().max(60).nullable().optional(),
  inactivityDays: z.number().int().min(1).max(365).nullable().optional(),
  requiredFields: z.array(z.string().trim().max(60)).max(30).optional(),
  checklist: z
    .array(z.object({ key: z.string().trim().min(1).max(60), label: z.string().trim().min(1).max(160) }))
    .max(20)
    .nullable()
    .optional(),
  requiresSiteVisit: z.boolean().optional(),
  requiresQuotation: z.boolean().optional(),
});

export type StageInput = z.infer<typeof stageInputSchema>;

/**
 * A pipeline must be able to answer "did we win this?". That needs exactly one
 * WON stage and one LOST stage, and at least one open stage to work through.
 */
export function validateStages(stages: StageInput[]): string[] {
  const errors: string[] = [];
  const won = stages.filter((stage) => stage.status === "WON");
  const lost = stages.filter((stage) => stage.status === "LOST");
  const open = stages.filter((stage) => stage.status === "OPEN");

  if (won.length !== 1) errors.push("A pipeline needs exactly one won stage.");
  if (lost.length !== 1) errors.push("A pipeline needs exactly one lost stage.");
  if (open.length === 0) errors.push("A pipeline needs at least one open stage.");

  const seen = new Set<string>();
  for (const stage of stages) {
    const key = stage.name.trim().toLowerCase();
    if (seen.has(key)) errors.push(`Two stages are both called "${stage.name}".`);
    seen.add(key);
  }

  return errors;
}

/**
 * Create a company's default pipeline. Idempotent: returns the existing
 * default if one is already there, so it is safe to call on every read path
 * that needs a pipeline to exist.
 */
export async function ensureDefaultPipeline(tx: Tx, companyId: string) {
  const existing = await tx.crmPipeline.findFirst({
    where: { companyId, isDefault: true },
    include: { stages: { where: { archivedAt: null }, orderBy: { position: "asc" } } },
  });
  if (existing) return existing;

  const pipeline = await tx.crmPipeline.create({
    data: {
      companyId,
      name: DEFAULT_PIPELINE_NAME,
      description: "Enquiry through site visit and quotation to a won job.",
      isDefault: true,
      position: 0,
      stages: {
        create: DEFAULT_STAGE_TEMPLATE.map((stage, index) => ({
          companyId,
          name: stage.name,
          position: index,
          status: stage.status,
          probability: stage.probability,
          colorToken: stage.colorToken ?? null,
          inactivityDays: stage.inactivityDays ?? null,
          requiresSiteVisit: stage.requiresSiteVisit ?? false,
          requiresQuotation: stage.requiresQuotation ?? false,
          checklist: stage.checklist ?? undefined,
        })),
      },
    },
    include: { stages: { where: { archivedAt: null }, orderBy: { position: "asc" } } },
  });

  return pipeline;
}

/** The stage a new deal starts in: the first open stage by position. */
export function firstOpenStage<T extends { status: CrmDealStatus; position: number }>(
  stages: T[],
): T | undefined {
  return stages
    .filter((stage) => stage.status === "OPEN")
    .sort((a, b) => a.position - b.position)[0];
}

/**
 * Whether a deal has sat in its stage past that stage's inactivity limit.
 * Only open stages go stale — a won or lost deal is finished, not neglected.
 */
export function isDealStale(
  deal: { stageEnteredAt: Date | string; status: CrmDealStatus },
  stage: { inactivityDays: number | null; status: CrmDealStatus },
  now: Date = new Date(),
): boolean {
  if (deal.status !== "OPEN" || stage.status !== "OPEN") return false;
  if (!stage.inactivityDays) return false;
  const entered = typeof deal.stageEnteredAt === "string" ? new Date(deal.stageEnteredAt) : deal.stageEnteredAt;
  const elapsedDays = (now.getTime() - entered.getTime()) / 86_400_000;
  return elapsedDays > stage.inactivityDays;
}

/**
 * Which of a stage's required fields a deal has not filled in yet. Returned as
 * labels so the caller can say what is missing rather than that something is.
 */
export function missingRequiredFields(
  deal: Record<string, unknown> & { customFields?: unknown },
  requiredFields: string[],
): string[] {
  const custom = (deal.customFields ?? {}) as Record<string, unknown>;
  return requiredFields.filter((field) => {
    const value = field in deal ? deal[field] : custom[field];
    if (value === null || value === undefined) return true;
    if (typeof value === "string") return value.trim() === "";
    if (Array.isArray(value)) return value.length === 0;
    return false;
  });
}
