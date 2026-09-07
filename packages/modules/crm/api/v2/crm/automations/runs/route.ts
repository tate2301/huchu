import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";

const LIMIT = 100;

/**
 * Every firing, newest first, across all workflows.
 *
 * A per-workflow run list answers "is this one working"; this answers "what
 * has the system been doing to my records", which is the question somebody has
 * when a lead turns up assigned to a person nobody assigned it to.
 */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status")?.trim().toUpperCase();
    const automationId = searchParams.get("automationId")?.trim();

    const runs = await prisma.crmAutomationRun.findMany({
      where: {
        companyId: session.user.companyId,
        ...(status === "FAILED" ? { status: { not: "SUCCEEDED" } } : {}),
        ...(status === "SUCCEEDED" ? { status: "SUCCEEDED" } : {}),
        ...(automationId ? { automationId } : {}),
      },
      select: {
        id: true,
        status: true,
        entity: true,
        recordId: true,
        result: true,
        createdAt: true,
        automation: { select: { id: true, name: true, trigger: true } },
      },
      orderBy: { createdAt: "desc" },
      take: LIMIT,
    });

    return successResponse({ data: runs });
  } catch (error) {
    console.error("[API] GET /api/v2/crm/automations/runs error:", error);
    return errorResponse("Failed to load workflow runs");
  }
}
