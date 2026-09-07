import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { hasCrmFullAccess } from "../../../../scope";
import {
  REPORT_RANGES,
  bucketByPeriod,
  bucketSeries,
  buildFunnel,
  forecast,
  medianCycleDays,
  medianDaysInStage,
  rangeToDates,
  shareSlices,
  summarizeGroups,
  winRate,
  type ReportRange,
  type StageChange,
} from "../../../../reports";

/**
 * The sales report.
 *
 * A rep sees their own numbers and a manager sees everyone's — the same rule
 * the rest of the CRM uses for editing, applied to reporting so a rep can't
 * quietly measure a colleague.
 */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;

    const { searchParams } = new URL(request.url);
    const requested = searchParams.get("range");
    const range: ReportRange =
      REPORT_RANGES.find((value) => value === requested) ?? "90d";
    const { from, to } = rangeToDates(range);

    const isManager = hasCrmFullAccess(session.user.role);
    const ownerScope = isManager ? {} : { assignedToId: session.user.id };

    const [deals, stages, activities, leads] = await Promise.all([
      prisma.crmDeal.findMany({
        where: { companyId, createdAt: { gte: from, lte: to }, ...ownerScope },
        select: {
          id: true,
          value: true,
          probability: true,
          createdAt: true,
          wonAt: true,
          lostAt: true,
          source: true,
          stageId: true,
          assignedToId: true,
          assignedTo: { select: { id: true, name: true } },
          stage: { select: { id: true, name: true, status: true, position: true } },
        },
      }),
      prisma.crmPipelineStage.findMany({
        where: { pipeline: { companyId, isDefault: true } },
        select: { id: true, name: true, status: true, position: true },
        orderBy: { position: "asc" },
      }),
      prisma.crmActivity.findMany({
        where: {
          companyId,
          occurredAt: { gte: from, lte: to },
          type: { not: "SYSTEM" },
          ...(isManager ? {} : { createdById: session.user.id }),
        },
        select: { occurredAt: true },
      }),
      prisma.crmLead.findMany({
        where: { companyId, createdAt: { gte: from, lte: to }, ...ownerScope },
        select: { id: true, convertedAt: true, source: true, sourceChannel: true },
      }),
    ]);

    // How long deals sit in each stage, reconstructed from the stage-change
    // trail. A separate query rather than part of the fan-out above because it
    // is keyed on the deals that came back: asking for every stage change in
    // the company would drag in years of history to answer a question about
    // this quarter.
    const stageChanges =
      deals.length === 0
        ? []
        : await prisma.crmActivity.findMany({
            where: {
              companyId,
              type: "STAGE_CHANGE",
              dealId: { in: deals.map((deal) => deal.id) },
            },
            select: { dealId: true, metadata: true, occurredAt: true },
            orderBy: { occurredAt: "asc" },
          });

    const transitions: StageChange[] = stageChanges.map((change) => {
      const metadata = (change.metadata ?? {}) as {
        fromStageId?: unknown;
        toStageId?: unknown;
      };
      return {
        dealId: change.dealId!,
        fromStageId: typeof metadata.fromStageId === "string" ? metadata.fromStageId : null,
        toStageId: typeof metadata.toStageId === "string" ? metadata.toStageId : null,
        at: change.occurredAt,
      };
    });

    const dwell = medianDaysInStage(
      deals.map((deal) => ({
        id: deal.id,
        createdAt: deal.createdAt,
        closedAt: deal.wonAt ?? deal.lostAt,
        currentStageId: deal.stageId,
      })),
      transitions,
    );

    // A deal that reached stage 4 also reached stages 1–3, so the funnel counts
    // everything at or past each position. Counting only what sits in a stage
    // right now would show a funnel that widens further down.
    const funnel = buildFunnel(
      stages.map((stage) => {
        const reached = deals.filter(
          (deal) =>
            deal.stage.position >= stage.position ||
            // Anything won has been through every open stage.
            (stage.status === "OPEN" && deal.wonAt !== null),
        );
        return {
          key: stage.id,
          label: stage.name,
          reached: reached.length,
          value: reached.reduce((sum, deal) => sum + (deal.value ?? 0), 0),
        };
      }),
    ).map((stage) => ({
      // Null rather than zero where nothing has been through: "0 days" reads
      // as instant, which is the opposite of "we have no idea yet".
      ...stage,
      medianDaysInStage: dwell[stage.key] ?? null,
    }));

    const counts = {
      won: deals.filter((deal) => deal.wonAt).length,
      lost: deals.filter((deal) => deal.lostAt).length,
      open: deals.filter((deal) => !deal.wonAt && !deal.lostAt).length,
    };

    const openDeals = deals.filter((deal) => !deal.wonAt && !deal.lostAt);

    const groupBy = (
      keyOf: (deal: (typeof deals)[number]) => { key: string; label: string },
    ) => {
      const map = new Map<
        string,
        {
          key: string;
          label: string;
          won: number;
          lost: number;
          open: number;
          wonValue: number;
          openValue: number;
        }
      >();
      for (const deal of deals) {
        const { key, label } = keyOf(deal);
        const row =
          map.get(key) ??
          { key, label, won: 0, lost: 0, open: 0, wonValue: 0, openValue: 0 };
        if (deal.wonAt) {
          row.won += 1;
          row.wonValue += deal.value ?? 0;
        } else if (deal.lostAt) {
          row.lost += 1;
        } else {
          row.open += 1;
          row.openValue += deal.value ?? 0;
        }
        map.set(key, row);
      }
      return summarizeGroups(Array.from(map.values()));
    };

    const byOwner = groupBy((deal) => ({
      key: deal.assignedToId ?? "unassigned",
      label: deal.assignedTo?.name ?? "Unassigned",
    }));
    const bySource = groupBy((deal) => ({
      key: deal.source ?? "unknown",
      label: deal.source ?? "Not recorded",
    }));

    // A year of daily points is 365 pixels of noise; a week of weekly points is
    // one. The bucket follows the range rather than being a setting nobody
    // would find.
    const granularity = range === "12m" ? "week" : "day";

    return successResponse({
      range,
      from: from.toISOString(),
      to: to.toISOString(),
      scope: isManager ? "TEAM" : "MINE",
      funnel,
      counts,
      winRate: winRate(counts),
      medianCycleDays: medianCycleDays(
        deals.map((deal) => ({
          openedAt: deal.createdAt,
          closedAt: deal.wonAt ?? deal.lostAt,
        })),
      ),
      forecast: forecast(
        openDeals.map((deal) => ({ value: deal.value, probability: deal.probability })),
      ),
      byOwner,
      bySource,
      // Where the won money came from, as slices of one total. Value rather
      // than count: two sources bringing in ten deals each are not equal when
      // one of them brings in ten times the money.
      sourceShare: shareSlices(
        bySource.map((row) => ({ key: row.key, label: row.label, value: row.wonValue })),
      ),
      // Won business over time, counted and totalled in the same walk so the
      // two lines cannot disagree with each other.
      trend: {
        granularity,
        won: bucketSeries(
          deals
            .filter((deal) => deal.wonAt)
            .map((deal) => ({ at: deal.wonAt!, value: deal.value ?? 0 })),
          { from, to },
          granularity,
        ),
        created: bucketSeries(
          deals.map((deal) => ({ at: deal.createdAt, value: deal.value ?? 0 })),
          { from, to },
          granularity,
        ),
      },
      activity: bucketByPeriod(
        activities.map((activity) => activity.occurredAt),
        { from, to },
        granularity,
      ),
      leads: {
        created: leads.length,
        converted: leads.filter((lead) => lead.convertedAt).length,
      },
    });
  } catch (error) {
    console.error("[API] GET /api/v2/crm/reports error:", error);
    return errorResponse("Failed to build the report");
  }
}
