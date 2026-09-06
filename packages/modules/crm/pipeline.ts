/**
 * CRM pipeline stage helpers.
 */
import type { CrmLeadStage, Prisma } from "@corelithzw/db";
import { z } from "zod";

import { convertLead } from "./conversion";

export const crmLeadStageSchema = z.enum([
  "NEW",
  "CONTACTED",
  "QUALIFIED",
  "SITE_VISIT",
  "QUOTED",
  "INVOICED",
  "WON",
  "LOST",
]);

export const CRM_LEAD_STAGES: CrmLeadStage[] = [
  "NEW",
  "CONTACTED",
  "QUALIFIED",
  "SITE_VISIT",
  "QUOTED",
  "INVOICED",
  "WON",
  "LOST",
];

export const CRM_OPEN_STAGES: CrmLeadStage[] = [
  "NEW",
  "CONTACTED",
  "QUALIFIED",
  "SITE_VISIT",
  "QUOTED",
  "INVOICED",
];

/**
 * Where each stage sits in the run of play. Used to answer "is this further
 * along than that", which a string enum cannot.
 */
const STAGE_ORDER: Record<CrmLeadStage, number> = {
  NEW: 0,
  CONTACTED: 1,
  QUALIFIED: 2,
  SITE_VISIT: 3,
  QUOTED: 4,
  INVOICED: 5,
  WON: 6,
  LOST: 7,
};

/**
 * Whether reaching this stage means the enquiry has become a real opportunity.
 *
 * Past Contacted, somebody has spoken to them and it is worth quoting: that is
 * a deal, and it should exist as one without anybody remembering to press
 * Convert. Lost is excluded deliberately — an enquiry that died before it was
 * ever qualified was never an opportunity, and manufacturing a deal to
 * immediately lose it inflates every funnel it appears in.
 */
export function stagePromotesToDeal(stage: CrmLeadStage): boolean {
  return stage !== "LOST" && STAGE_ORDER[stage] > STAGE_ORDER.CONTACTED;
}

export const CRM_STAGE_LABELS: Record<CrmLeadStage, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  QUALIFIED: "Qualified",
  SITE_VISIT: "Site Visit",
  QUOTED: "Quoted",
  INVOICED: "Invoiced",
  WON: "Won",
  LOST: "Lost",
};

/**
 * Default win-probability per stage (0-100). Individual leads may override via
 * CrmLead.probability.
 */
export const CRM_STAGE_DEFAULT_PROBABILITY: Record<CrmLeadStage, number> = {
  NEW: 10,
  CONTACTED: 20,
  QUALIFIED: 40,
  SITE_VISIT: 55,
  QUOTED: 70,
  INVOICED: 90,
  WON: 100,
  LOST: 0,
};

export function defaultProbabilityForStage(stage: CrmLeadStage): number {
  return CRM_STAGE_DEFAULT_PROBABILITY[stage];
}

/**
 * Move a lead to a new stage and log the change on its timeline.
 *
 * Shared by the single-lead endpoint, the bulk action, and the pipeline board
 * so a drag on the board and a dropdown on the detail page produce identical
 * history. Callers are responsible for the tenant and permission checks; this
 * only runs inside a transaction they own.
 */
export async function changeLeadStage(
  tx: Prisma.TransactionClient,
  params: {
    companyId: string;
    userId: string;
    lead: {
      id: string;
      stage: CrmLeadStage;
      clientId: string | null;
      /** Set once the lead has already become a deal. */
      convertedDealId?: string | null;
      title?: string | null;
      leadNo?: string;
      estimatedValue?: number | null;
      currency?: string | null;
      assignedToId?: string | null;
    };
    stage: CrmLeadStage;
    lostReason?: string | null;
    now?: Date;
  },
) {
  const now = params.now ?? new Date();
  const { lead, stage } = params;

  // Promote before the stage lands, not after: `convertLead` finishes by
  // setting the lead to QUALIFIED, so converting second would quietly drag a
  // lead moved straight to QUOTED back a stage.
  let promotedDealId: string | null = null;
  if (stagePromotesToDeal(stage) && !lead.convertedDealId) {
    const result = await convertLead(tx, {
      companyId: params.companyId,
      userId: params.userId,
      leadId: lead.id,
      input: {
        // Everything else is inferred from the lead. A promotion nobody asked
        // for should not stop to ask questions; the deal can be edited after.
        dealTitle: lead.title?.trim() || `Enquiry ${lead.leadNo ?? ""}`.trim(),
        clientId: lead.clientId ?? undefined,
        value: lead.estimatedValue ?? undefined,
        currency: lead.currency ?? undefined,
        assignedToId: lead.assignedToId ?? undefined,
        createCompany: false,
      },
    });
    promotedDealId = result.dealId;
  }

  const updated = await tx.crmLead.update({
    where: { id: lead.id },
    data: {
      stage,
      probability: defaultProbabilityForStage(stage),
      // Terminal timestamps always reflect the current stage: entering a
      // terminal stage stamps it and clears the opposing one; reopening to a
      // non-terminal stage clears both (no contradictory wonAt+lostAt).
      wonAt: stage === "WON" ? now : null,
      lostAt: stage === "LOST" ? now : null,
      lostReason: stage === "LOST" ? params.lostReason ?? null : null,
    },
  });

  await tx.crmActivity.create({
    data: {
      companyId: params.companyId,
      type: "STAGE_CHANGE",
      leadId: lead.id,
      clientId: lead.clientId ?? undefined,
      subject: `Stage changed ${CRM_STAGE_LABELS[lead.stage]} → ${CRM_STAGE_LABELS[stage]}`,
      metadata: {
        fromStage: lead.stage,
        toStage: stage,
        ...(params.lostReason ? { lostReason: params.lostReason } : {}),
        ...(promotedDealId ? { promotedDealId } : {}),
      },
      createdById: params.userId,
      occurredAt: now,
    },
  });

  return { ...updated, promotedDealId };
}
