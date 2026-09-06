import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@corelithzw/db";
import { randomUUID } from "crypto";

import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { canUser, denialMessage } from "@corelithzw/module-crm/permissions";
import { TEMPLATE_KINDS, templateProblems, templateSchema } from "@corelithzw/module-documents/blocks";

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const kind = searchParams.get("kind")?.trim().toUpperCase();
    const linkedEntity = searchParams.get("linkedEntity")?.trim();
    const linkedRecordId = searchParams.get("linkedRecordId")?.trim();

    const templates = await prisma.crmTemplate.findMany({
      where: {
        companyId: session.user.companyId,
        ...(kind && (TEMPLATE_KINDS as readonly string[]).includes(kind) ? { kind } : {}),
        ...(linkedEntity ? { linkedEntity } : {}),
        ...(linkedRecordId ? { linkedRecordId } : {}),
        // A draft belongs to whoever is writing it; everything else is the
        // team's, which is the point of a template library.
        OR: [{ isShared: true }, { createdById: session.user.id }],
      },
      select: {
        id: true,
        name: true,
        kind: true,
        attributes: true,
        isShared: true,
        isActive: true,
        linkedEntity: true,
        linkedRecordId: true,
        publicToken: true,
        viewCount: true,
        submitCount: true,
        lastViewedAt: true,
        lastSubmitAt: true,
        updatedAt: true,
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: [{ kind: "asc" }, { name: "asc" }],
    });

    return successResponse({ data: templates });
  } catch (error) {
    console.error("[API] GET /api/v2/crm/templates error:", error);
    return errorResponse("Failed to load templates");
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

    const data = templateSchema.parse(await request.json());

    const problems = templateProblems(data.kind, data.blocks);
    if (problems.length > 0) {
      return errorResponse("This template is not ready to save", 400, problems);
    }

    const template = await prisma.crmTemplate.create({
      data: {
        companyId: session.user.companyId,
        name: data.name,
        kind: data.kind,
        attributes: data.attributes as unknown as Prisma.InputJsonValue,
        blocks: data.blocks as unknown as Prisma.InputJsonValue,
        isShared: data.isShared,
        isActive: data.isActive,
        linkedEntity: data.linkedEntity ?? null,
        linkedRecordId: data.linkedRecordId ?? null,
        // Forms are the only kind that gets a public link, and it is minted at
        // creation so publishing later is a switch rather than a migration.
        publicToken: data.kind === "FORM" ? randomUUID() : null,
        createdById: session.user.id,
      },
    });

    return successResponse(template, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      return errorResponse("A template of this kind already has that name.", 409);
    }
    console.error("[API] POST /api/v2/crm/templates error:", error);
    return errorResponse("Failed to create the template");
  }
}
