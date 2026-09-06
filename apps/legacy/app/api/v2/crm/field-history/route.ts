import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";

const LIMIT = 200;

/**
 * What changed on one record, field by field.
 *
 * Reads are open for the same reason the rest of the CRM's are: hiding who
 * moved a number from the people working the pipeline causes more trouble than
 * the privacy it buys, and the first question after "why is this wrong" is
 * always "who touched it".
 */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const entity = searchParams.get("entity")?.trim().toUpperCase();
    const recordId = searchParams.get("recordId")?.trim();
    const field = searchParams.get("field")?.trim();

    if (!entity || !recordId) {
      return errorResponse("entity and recordId are required", 400);
    }

    const changes = await prisma.crmFieldChange.findMany({
      where: {
        companyId: session.user.companyId,
        entity,
        recordId,
        ...(field ? { field } : {}),
      },
      select: {
        id: true,
        field: true,
        oldValue: true,
        newValue: true,
        createdAt: true,
        changedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: LIMIT,
    });

    return successResponse({ data: changes });
  } catch (error) {
    console.error("[API] GET /api/v2/crm/field-history error:", error);
    return errorResponse("Failed to load the field history");
  }
}
