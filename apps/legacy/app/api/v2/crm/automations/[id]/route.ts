import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@corelithzw/db";

import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { canUser, denialMessage } from "@corelithzw/module-crm/permissions";
import { automationSchema } from "@corelithzw/module-crm/automation";

const updateSchema = automationSchema.partial();

/**
 * One workflow, with enough of its history to say whether it works.
 *
 * There was no GET here at all: the editor fetched this URL, Next answered
 * 405, and the page rendered "Workflow not found" — so no workflow could be
 * opened or edited. Reading is gated on seeing the CRM rather than on managing
 * settings, because looking at what a rule does is not changing it.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;

    if (!(await canUser(session, "records.read"))) {
      return errorResponse(denialMessage("records.read"), 403);
    }

    const automation = await prisma.crmAutomation.findFirst({
      where: { id, companyId: session.user.companyId },
      include: {
        runs: {
          orderBy: { createdAt: "desc" },
          take: 20,
          select: { id: true, status: true, createdAt: true, result: true },
        },
      },
    });
    if (!automation) return errorResponse("Workflow not found", 404);

    return successResponse(automation);
  } catch (error) {
    console.error("[API] GET /api/v2/crm/automations/[id] error:", error);
    return errorResponse("Failed to load the workflow");
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;

    if (!(await canUser(session, "settings.manage"))) {
      return errorResponse(denialMessage("settings.manage"), 403);
    }

    const existing = await prisma.crmAutomation.findFirst({
      where: { id, companyId: session.user.companyId },
      select: { id: true },
    });
    if (!existing) return errorResponse("Automation not found", 404);

    const data = updateSchema.parse(await request.json());

    const automation = await prisma.crmAutomation.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description,
        trigger: data.trigger,
        triggerConfig: data.triggerConfig
          ? (data.triggerConfig as Prisma.InputJsonValue)
          : undefined,
        conditions: data.conditions
          ? (data.conditions as unknown as Prisma.InputJsonValue)
          : undefined,
        actions: data.actions ? (data.actions as unknown as Prisma.InputJsonValue) : undefined,
        isEnabled: data.isEnabled,
      },
    });

    return successResponse(automation);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    console.error("[API] PATCH /api/v2/crm/automations/[id] error:", error);
    return errorResponse("Failed to update the automation");
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;

    if (!(await canUser(session, "settings.manage"))) {
      return errorResponse(denialMessage("settings.manage"), 403);
    }

    const existing = await prisma.crmAutomation.findFirst({
      where: { id, companyId: session.user.companyId },
      select: { id: true },
    });
    if (!existing) return errorResponse("Automation not found", 404);

    // Runs cascade with the rule. Keeping orphaned run rows would leave a
    // history nothing can explain.
    await prisma.crmAutomation.delete({ where: { id } });
    return successResponse({ id });
  } catch (error) {
    console.error("[API] DELETE /api/v2/crm/automations/[id] error:", error);
    return errorResponse("Failed to delete the automation");
  }
}
