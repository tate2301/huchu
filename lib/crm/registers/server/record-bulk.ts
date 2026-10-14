import type { CrmLeadStage } from "@prisma/client";

import { CRM_LEAD_STAGES, changeLeadStage } from "@/lib/crm/pipeline";
import { prisma } from "@/lib/prisma";

import { bulkSpec } from "./bulk";

/*
 * Deals' and leads' bulk changes, for their bulk routes and for Vane's
 * approved "assign an owner" and "move these leads".
 */

/**
 * Assign, archive or restore many deals at once. A stage move is not here:
 * it has rules of its own — required fields, a reason for a loss — that are
 * checked a deal at a time, on the board or the deal.
 */
export const DEAL_BULK = bulkSpec({
  noun: { one: "deal", many: "deals" },
  actions: ["assign", "archive", "restore"],
  load: (companyId, ids) =>
    prisma.crmDeal.findMany({
      where: { id: { in: ids }, companyId },
      select: { id: true, assignedToId: true, archivedAt: true },
    }),
  update: async (rows, { data }) => {
    await prisma.crmDeal.updateMany({ where: { id: { in: rows.map((row) => row.id) } }, data });
  },
});

/**
 * Assign, move, archive or restore many leads at once. Each leaves the same
 * history a single change does: a stage move runs through `changeLeadStage`,
 * so a lead moved past Contacted becomes a deal exactly as a drag on the
 * board makes it one, and Lost carries its reason.
 */
export const LEAD_BULK = bulkSpec({
  noun: { one: "lead", many: "leads" },
  actions: ["assign", "status", "archive", "restore"],
  status: { field: "stage", values: CRM_LEAD_STAGES, needsReason: ["LOST"] },
  load: async (companyId, ids) =>
    (
      await prisma.crmLead.findMany({
        where: { id: { in: ids }, companyId },
        select: {
          id: true,
          stage: true,
          assignedToId: true,
          clientId: true,
          convertedDealId: true,
          convertedAt: true,
          archivedAt: true,
          leadNo: true,
          title: true,
          estimatedValue: true,
          currency: true,
        },
      })
    ).map((lead) => ({ ...lead, status: lead.stage })),
  // Restoring a converted lead would put a deal's own origin back in the
  // pipeline beside it.
  refuse: (lead, action) => (action === "restore" && lead.convertedAt ? "converted leads stay with their deal" : null),
  update: async (leads, change, actor) => {
    const { companyId, userId } = actor;

    if (change.action === "status") {
      await prisma.$transaction(
        async (tx) => {
          for (const lead of leads) {
            await changeLeadStage(tx, {
              companyId,
              userId,
              lead,
              stage: change.value as CrmLeadStage,
              lostReason: change.reason,
            });
          }
        },
        // A move past Contacted converts each lead to a deal as it goes.
        { timeout: 60_000 },
      );
      return;
    }

    const now = new Date();
    const assignee =
      change.action === "assign" && change.value
        ? await prisma.user.findFirst({ where: { id: change.value, companyId }, select: { name: true } })
        : null;
    const subject = (lead: (typeof leads)[number]) => {
      switch (change.action) {
        case "assign":
          return change.value ? `Lead assigned to ${assignee?.name ?? "a teammate"}` : "Lead unassigned";
        case "archive":
          return `Lead ${lead.leadNo} archived`;
        default:
          return `Lead ${lead.leadNo} restored`;
      }
    };

    await prisma.$transaction(async (tx) => {
      await tx.crmLead.updateMany({
        where: { id: { in: leads.map((lead) => lead.id) }, companyId },
        data:
          change.action === "archive"
            ? { archivedAt: now, archivedById: userId }
            : change.action === "restore"
              ? { archivedAt: null, archivedById: null }
              : change.data,
      });
      await tx.crmActivity.createMany({
        data: leads.map((lead) => ({
          companyId,
          type: "SYSTEM" as const,
          leadId: lead.id,
          clientId: lead.clientId ?? undefined,
          subject: subject(lead),
          ...(change.action === "assign" ? { metadata: { assignedToId: change.value } } : {}),
          occurredAt: now,
          createdById: userId,
        })),
      });
    });
  },
});
