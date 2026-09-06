import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { ensureDefaultPipeline } from "@corelithzw/module-crm/pipelines";
import { hasCrmFullAccess } from "@corelithzw/module-crm/scope";

/**
 * Cards fetched per column. The board is for working a pipeline, not for
 * reading every record — past this point the column links out to the list.
 */
const CARDS_PER_COLUMN = 50;

/**
 * One pipeline's board.
 *
 * Deliberately one pipeline at a time rather than every deal in the company.
 * Pipelines exist because different work moves through different stages —
 * a supply-only order and a supply-and-fit job do not share a shape — so a
 * single board mixing them would have columns that mean different things
 * depending on which card is in them, and dragging between those columns
 * would be nonsense. Which pipeline is a choice the caller makes; without
 * one, the default.
 */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const companyId = session.user.companyId;
    const { searchParams } = new URL(request.url);
    const requestedPipelineId = searchParams.get("pipelineId");
    const mineOnly = searchParams.get("mineOnly") === "1";
    const q = searchParams.get("q")?.trim();

    await prisma.$transaction((tx) => ensureDefaultPipeline(tx, companyId));

    const pipeline = requestedPipelineId
      ? await prisma.crmPipeline.findFirst({
          where: { id: requestedPipelineId, companyId, isActive: true },
          select: {
            id: true,
            name: true,
            stages: {
              where: { archivedAt: null },
              orderBy: { position: "asc" },
              select: {
                id: true,
                name: true,
                status: true,
                position: true,
                colorToken: true,
              },
            },
          },
        })
      : await prisma.crmPipeline.findFirst({
          where: { companyId, isDefault: true, isActive: true },
          select: {
            id: true,
            name: true,
            stages: {
              where: { archivedAt: null },
              orderBy: { position: "asc" },
              select: {
                id: true,
                name: true,
                status: true,
                position: true,
                colorToken: true,
              },
            },
          },
        });

    if (!pipeline) {
      return errorResponse("That pipeline does not exist", 404);
    }

    // A rep sees their own deals; a manager sees the team's. `mineOnly` lets a
    // manager narrow to theirs without pretending to be a rep.
    const isManager = hasCrmFullAccess(session.user.role);
    const where = {
      companyId,
      pipelineId: pipeline.id,
      archivedAt: null,
      ...(isManager && !mineOnly ? {} : { assignedToId: session.user.id }),
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" as const } },
              { dealNo: { contains: q, mode: "insensitive" as const } },
              { client: { name: { contains: q, mode: "insensitive" as const } } },
            ],
          }
        : {}),
    };

    // One query per column. A single ordered fetch across all stages would let
    // a busy stage crowd the quieter ones out of the result set entirely.
    const [perStage, grouped] = await Promise.all([
      Promise.all(
        pipeline.stages.map((stage) =>
          prisma.crmDeal.findMany({
            where: { ...where, stageId: stage.id },
            select: {
              id: true,
              dealNo: true,
              title: true,
              value: true,
              currency: true,
              status: true,
              stageId: true,
              stageEnteredAt: true,
              expectedCloseDate: true,
              emoji: true,
              avatarUrl: true,
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
      // Counts and totals cover the whole filtered set, not just the cards on
      // screen, so the column headers stay honest past fifty.
      prisma.crmDeal.groupBy({
        by: ["stageId"],
        where,
        _count: { _all: true },
        _sum: { value: true },
      }),
    ]);

    const totals = new Map(
      grouped.map((row) => [
        row.stageId,
        { count: row._count._all, totalValue: row._sum.value ?? 0 },
      ]),
    );

    const columns = pipeline.stages.map((stage, index) => {
      const deals = perStage[index];
      const summary = totals.get(stage.id) ?? { count: 0, totalValue: 0 };
      return {
        stage,
        count: summary.count,
        totalValue: summary.totalValue,
        hasMore: summary.count > deals.length,
        deals: deals.map(({ followUps, ...deal }) => ({
          ...deal,
          nextFollowUp: followUps[0] ?? null,
        })),
      };
    });

    return successResponse({
      pipeline: { id: pipeline.id, name: pipeline.name },
      columns,
      cardsPerColumn: CARDS_PER_COLUMN,
    });
  } catch (error) {
    console.error("[API] GET /api/v2/crm/deals/board error:", error);
    return errorResponse("Failed to fetch the deals board");
  }
}
