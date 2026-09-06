import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import {
  CRM_FIELD_ENTITIES,
  fieldDefinitionInputSchema,
  normalizeFieldKey,
  validateDefinition,
} from "@corelithzw/module-records/custom-fields";
import { requireCrmCapability } from "../_helpers";

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const entityParam = searchParams.get("entity");
    const entity = CRM_FIELD_ENTITIES.find((value) => value === entityParam);
    const includeArchived = searchParams.get("includeArchived") === "1";

    const definitions = await prisma.crmFieldDefinition.findMany({
      where: {
        companyId: session.user.companyId,
        ...(entity ? { entity } : {}),
        ...(includeArchived ? {} : { archivedAt: null }),
      },
      orderBy: [{ entity: "asc" }, { position: "asc" }, { label: "asc" }],
    });

    return successResponse({ data: definitions });
  } catch (error) {
    console.error("[API] GET /api/v2/crm/field-definitions error:", error);
    return errorResponse("Failed to fetch field definitions");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    if (!await requireCrmCapability(session, "fields.manage")) {
      return errorResponse("Only managers can add custom fields", 403);
    }
    const companyId = session.user.companyId;

    const data = fieldDefinitionInputSchema.parse(await request.json());
    const errors = validateDefinition(data);
    if (errors.length > 0) return errorResponse("Validation failed", 400, errors);

    // The key is derived from the label unless one was given, and is immutable
    // afterwards — it is the JSON key every stored value is filed under.
    const key = normalizeFieldKey(data.key ?? data.label);
    if (!key) return errorResponse("That label doesn't produce a usable field key", 400);

    const clash = await prisma.crmFieldDefinition.findFirst({
      where: { companyId, entity: data.entity, key },
      select: { id: true, archivedAt: true },
    });
    if (clash) {
      return errorResponse(
        clash.archivedAt
          ? "An archived field already uses that name. Restore it instead of creating a duplicate."
          : "A field with that name already exists here.",
        409,
      );
    }

    const count = await prisma.crmFieldDefinition.count({
      where: { companyId, entity: data.entity, archivedAt: null },
    });

    const definition = await prisma.crmFieldDefinition.create({
      data: {
        companyId,
        entity: data.entity,
        key,
        label: data.label,
        description: data.description ?? undefined,
        type: data.type,
        isRequired: data.isRequired ?? false,
        defaultValue: (data.defaultValue ?? undefined) as never,
        options: (data.options ?? undefined) as never,
        section: data.section ?? undefined,
        position: data.position ?? count,
        showInTable: data.showInTable ?? false,
        createdById: session.user.id,
      },
    });

    return successResponse(definition, 201);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    console.error("[API] POST /api/v2/crm/field-definitions error:", error);
    return errorResponse("Failed to create field definition");
  }
}
