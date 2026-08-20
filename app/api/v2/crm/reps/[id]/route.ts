import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { getRepPerformance } from "@/lib/crm/insights";
import { hasCrmFullAccess } from "@/lib/crm/scope";
import { rangeToDates, REPORT_RANGES, type ReportRange } from "@/lib/crm/reports";

/** How much of a rep's book to put on one page before it stops being readable. */
const SAMPLE = 20;

/**
 * One salesperson, as a record: who they are, what they are carrying, what
 * they have closed, and what they have been doing.
 *
 * Reads are open — the product rule is that every CRM user can see the whole
 * company pipeline, and you cannot hand a lead to someone whose workload is
 * invisible. Performance numbers keep the insights rule: only a manager, or
 * the rep themselves, gets them.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;
    const { id } = await context.params;

    const rep = await prisma.user.findFirst({
      where: { id, companyId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });
    if (!rep) return errorResponse("Rep not found", 404);

    const canSeeNumbers = hasCrmFullAccess(session.user.role) || session.user.id === id;

    const { searchParams } = new URL(request.url);
    const requested = searchParams.get("range");
    const range = (REPORT_RANGES as readonly string[]).includes(requested ?? "")
      ? (requested as ReportRange)
      : "90d";
    const { from, to } = rangeToDates(range);

    const [leads, deals, tasks, activities, documents, wonCount, lostCount] =
      await Promise.all([
        prisma.crmLead.findMany({
          // The rep's live pipeline. A converted lead is archived and its deal
          // is listed right beside this, so an archived row here would show
          // the same opportunity twice on one person's page.
          where: {
            companyId,
            assignedToId: id,
            archivedAt: null,
            stage: { notIn: ["WON", "LOST"] },
          },
          select: {
            id: true,
            leadNo: true,
            title: true,
            stage: true,
            estimatedValue: true,
            currency: true,
            updatedAt: true,
            client: { select: { id: true, name: true } },
          },
          orderBy: { updatedAt: "desc" },
          take: SAMPLE,
        }),
        prisma.crmDeal.findMany({
          where: { companyId, assignedToId: id, status: "OPEN" },
          select: {
            id: true,
            dealNo: true,
            title: true,
            value: true,
            currency: true,
            expectedCloseDate: true,
            updatedAt: true,
            stage: { select: { id: true, name: true } },
            client: { select: { id: true, name: true } },
          },
          orderBy: { updatedAt: "desc" },
          take: SAMPLE,
        }),
        prisma.crmTask.findMany({
          where: { companyId, assignedToId: id, status: "OPEN" },
          select: {
            id: true,
            title: true,
            type: true,
            priority: true,
            dueAt: true,
            leadId: true,
            dealId: true,
            clientId: true,
          },
          orderBy: { dueAt: "asc" },
          take: SAMPLE,
        }),
        prisma.crmActivity.findMany({
          where: { companyId, createdById: id },
          select: {
            id: true,
            type: true,
            subject: true,
            body: true,
            occurredAt: true,
            lead: { select: { id: true, title: true } },
            deal: { select: { id: true, title: true } },
            client: { select: { id: true, name: true } },
          },
          orderBy: { occurredAt: "desc" },
          take: SAMPLE,
        }),
        prisma.crmLeadDocument.findMany({
          where: { companyId, createdById: id },
          select: { type: true, amount: true, currency: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          take: 200,
        }),
        prisma.crmLead.count({ where: { companyId, assignedToId: id, stage: "WON" } }),
        prisma.crmLead.count({ where: { companyId, assignedToId: id, stage: "LOST" } }),
      ]);

    let performance = null;
    if (canSeeNumbers) {
      const rows = await getRepPerformance(companyId, { from, to, repId: id });
      // The helper aggregates by lead assignee, so a rep with no leads in the
      // window comes back missing rather than zeroed.
      performance = rows.find((row) => row.repId === id) ?? null;
    }

    return successResponse({
      rep,
      canSeeNumbers,
      range,
      performance,
      closed: { won: wonCount, lost: lostCount },
      leads,
      deals,
      tasks,
      activities,
      documents,
    });
  } catch (error) {
    console.error("[API] GET /api/v2/crm/reps/[id] error:", error);
    return errorResponse("Failed to fetch the rep");
  }
}
