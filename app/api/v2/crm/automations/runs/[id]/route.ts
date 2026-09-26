/**
 * One workflow run, for its own page: which workflow fired, on what record,
 * and what each of its actions did.
 */
import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

/** The record a run touched, by name — or null once it is gone. */
async function recordLabel(companyId: string, entity: string, id: string): Promise<string | null> {
  const where = { id, companyId };
  switch (entity) {
    case "DEAL":
      return (await prisma.crmDeal.findFirst({ where, select: { title: true } }))?.title ?? null;
    case "LEAD": {
      const lead = await prisma.crmLead.findFirst({ where, select: { title: true, leadNo: true } });
      return lead ? (lead.title ?? lead.leadNo) : null;
    }
    case "PERSON":
      return (await prisma.crmPerson.findFirst({ where, select: { fullName: true } }))?.fullName ?? null;
    case "CLIENT":
      return (await prisma.crmClient.findFirst({ where, select: { name: true } }))?.name ?? null;
    case "SITE":
      return (await prisma.crmSite.findFirst({ where, select: { name: true } }))?.name ?? null;
    default:
      return null;
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;

    const run = await prisma.crmAutomationRun.findFirst({
      where: { id, companyId: session.user.companyId },
      select: {
        id: true,
        status: true,
        entity: true,
        recordId: true,
        result: true,
        durationMs: true,
        actionCount: true,
        createdAt: true,
        automation: { select: { id: true, name: true, trigger: true, isEnabled: true } },
      },
    });
    if (!run) return errorResponse("Workflow run not found", 404);

    return successResponse({
      run,
      recordLabel: await recordLabel(session.user.companyId, run.entity, run.recordId),
    });
  } catch (error) {
    console.error("[API] GET /api/v2/crm/automations/runs/[id] error:", error);
    return errorResponse("Failed to load the workflow run");
  }
}
