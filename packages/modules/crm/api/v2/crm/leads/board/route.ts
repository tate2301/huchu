import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { CRM_LEAD_STAGES } from "../../../../../pipeline";
import { buildLeadWhere, parseLeadFiltersFromParams } from "../../../../../views";

/**
 * Cards fetched per column. The board is for working the pipeline, not for
 * reading every record — past this point the column links out to the table.
 */
const CARDS_PER_COLUMN = 50;

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    // Stage is the board's axis, so a stage filter would empty other columns.
    const parsedFilters = parseLeadFiltersFromParams(searchParams);
    delete parsedFilters.stages;
    const filters = parsedFilters;
    const where = buildLeadWhere(session.user.companyId, filters, session.user.id);

    // One query per column: a single ordered fetch across all stages would let
    // a busy stage crowd the quieter ones out of the result set entirely.
    const [perStage, grouped] = await Promise.all([
      Promise.all(
        CRM_LEAD_STAGES.map((stage) =>
          prisma.crmLead.findMany({
            where: { ...where, stage },
            select: {
              id: true,
              leadNo: true,
              title: true,
              stage: true,
              estimatedValue: true,
              currency: true,
              contactName: true,
              createdAt: true,
              updatedAt: true,
              // Past Contacted an enquiry has become a deal, and the card
              // should say so and open the deal rather than the lead it grew
              // out of — otherwise the board shows you the husk.
              convertedDealId: true,
              convertedDeal: { select: { id: true, dealNo: true, value: true } },
              client: { select: { id: true, name: true } },
              assignedTo: { select: { id: true, name: true } },
              followUps: {
                where: { status: "PENDING" },
                orderBy: { dueAt: "asc" },
                take: 1,
                select: { id: true, title: true, dueAt: true },
              },
            },
            orderBy: { updatedAt: "desc" },
            take: CARDS_PER_COLUMN,
          }),
        ),
      ),
      // Column count and value cover the whole filtered set, not just the
      // cards on screen, so the header totals stay honest.
      prisma.crmLead.groupBy({
        by: ["stage"],
        where,
        _count: { _all: true },
        _sum: { estimatedValue: true },
      }),
    ]);

    const leads = perStage.flat();

    // Days-in-stage comes from the most recent STAGE_CHANGE per lead; leads
    // that have never moved fall back to when they were created.
    const stageEntered = new Map<string, Date>();
    if (leads.length > 0) {
      const changes = await prisma.crmActivity.findMany({
        where: {
          companyId: session.user.companyId,
          type: "STAGE_CHANGE",
          leadId: { in: leads.map((lead) => lead.id) },
        },
        select: { leadId: true, occurredAt: true },
        orderBy: { occurredAt: "desc" },
      });
      for (const change of changes) {
        if (!change.leadId) continue;
        if (!stageEntered.has(change.leadId)) {
          stageEntered.set(change.leadId, change.occurredAt);
        }
      }
    }

    const totals = new Map(
      grouped.map((row) => [
        row.stage,
        { count: row._count._all, totalValue: row._sum.estimatedValue ?? 0 },
      ]),
    );

    const columns = CRM_LEAD_STAGES.map((stage, index) => {
      const stageLeads = perStage[index];
      const summary = totals.get(stage) ?? { count: 0, totalValue: 0 };
      return {
        stage,
        count: summary.count,
        totalValue: summary.totalValue,
        hasMore: summary.count > stageLeads.length,
        leads: stageLeads.map(({ followUps, convertedDeal, ...lead }) => ({
          ...lead,
          nextFollowUp: followUps[0] ?? null,
          stageEnteredAt: stageEntered.get(lead.id) ?? lead.createdAt,
          deal: convertedDeal
            ? { id: convertedDeal.id, dealNo: convertedDeal.dealNo, value: convertedDeal.value }
            : null,
          // The deal's own value supersedes the lead's estimate once one
          // exists — that is the number somebody actually agreed to.
          estimatedValue: convertedDeal?.value ?? lead.estimatedValue,
        })),
      };
    });

    return successResponse({ columns, cardsPerColumn: CARDS_PER_COLUMN });
  } catch (error) {
    console.error("[API] GET /api/v2/crm/leads/board error:", error);
    return errorResponse("Failed to fetch pipeline board");
  }
}
