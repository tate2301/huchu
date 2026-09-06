import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@corelithzw/db";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@corelithzw/db/client";
import { canUser, denialMessage } from "@/lib/crm/permissions";
import { automationSchema } from "@/lib/crm/automation";

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const automations = await prisma.crmAutomation.findMany({
      where: { companyId: session.user.companyId },
      include: {
        createdBy: { select: { id: true, name: true } },
        // The last few firings, so a rule that is quietly failing shows up
        // next to the rule rather than in a log nobody opens.
        runs: {
          orderBy: { createdAt: "desc" },
          take: 5,
          select: { id: true, status: true, createdAt: true, entity: true, recordId: true },
        },
      },
      orderBy: [{ isEnabled: "desc" }, { createdAt: "desc" }],
    });

    return successResponse({ data: automations });
  } catch (error) {
    console.error("[API] GET /api/v2/crm/automations error:", error);
    return errorResponse("Failed to fetch automations");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    if (!(await canUser(session, "settings.manage"))) {
      return errorResponse(denialMessage("settings.manage"), 403);
    }

    const data = automationSchema.parse(await request.json());

    const automation = await prisma.crmAutomation.create({
      data: {
        companyId: session.user.companyId,
        name: data.name,
        description: data.description ?? undefined,
        trigger: data.trigger,
        triggerConfig: (data.triggerConfig ?? {}) as Prisma.InputJsonValue,
        conditions: data.conditions as unknown as Prisma.InputJsonValue,
        actions: data.actions as unknown as Prisma.InputJsonValue,
        isEnabled: data.isEnabled,
        createdById: session.user.id,
      },
    });

    return successResponse(automation, 201);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    console.error("[API] POST /api/v2/crm/automations error:", error);
    return errorResponse("Failed to create the automation");
  }
}
