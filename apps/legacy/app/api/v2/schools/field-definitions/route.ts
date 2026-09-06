import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import {
  fieldDefinitionInputSchema,
  normalizeFieldKey,
  validateDefinition,
} from "@/lib/crm/custom-fields";
import { prisma } from "@corelithzw/db/client";
import { SCHOOL_RECORD_TYPES, type SchoolRecordType } from "@/lib/records/registry";
import { schoolPermissionDenial } from "@/lib/schools/permissions";

/**
 * S-4.4 — a school's own fields on a pupil or a parent.
 *
 * A school's door onto the SAME engine, not a second one. The definitions live
 * in `CrmFieldDefinition`, the values in a `customFields` JSON column, and every
 * rule about keys, types, options and merging stays in
 * `lib/crm/custom-fields.ts`. Nothing here re-implements any of it.
 *
 * The reason this file exists at all is a feature gate, not a design choice:
 * `/api/v2/crm/field-definitions` is registered against `crm.settings` in
 * `lib/platform/gating/route-registry.ts`, so a school without the CRM module —
 * which is every school — is refused before the handler runs. Adding the six
 * school types to `CrmFieldEntity` made the data model ready and changed nothing
 * about who could reach it.
 *
 * This route is deliberately narrower than the CRM one in two ways: it will only
 * answer for school record types, so a schools session cannot enumerate or
 * create fields on a CRM entity through it; and it gates on `schools.students`
 * rather than on a CRM capability.
 */

const SCHOOL_ENTITIES = new Set<string>(SCHOOL_RECORD_TYPES);

function schoolEntity(value: string | null): SchoolRecordType | null {
  if (!value || !SCHOOL_ENTITIES.has(value)) return null;
  return value as SchoolRecordType;
}

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.students", "view");
    if (denied) return errorResponse(denied, 403);

    const { searchParams } = new URL(request.url);
    const requested = searchParams.get("entity");
    const entity = schoolEntity(requested);
    if (requested && !entity) {
      return errorResponse(
        `${requested} is not a school record type. One of: ${SCHOOL_RECORD_TYPES.join(", ")}`,
        400,
      );
    }

    const definitions = await prisma.crmFieldDefinition.findMany({
      where: {
        companyId: session.user.companyId,
        // Never unscoped: without an entity this still answers only for school
        // types, so a schools caller cannot read a tenant's CRM field layout.
        entity: entity ? entity : { in: [...SCHOOL_RECORD_TYPES] },
        ...(searchParams.get("includeArchived") === "1" ? {} : { archivedAt: null }),
      },
      orderBy: [{ entity: "asc" }, { position: "asc" }, { label: "asc" }],
    });

    return successResponse({ data: definitions });
  } catch (error) {
    console.error("[API] GET /api/v2/schools/field-definitions error:", error);
    return errorResponse("Failed to fetch field definitions");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    // Adding a field changes what every record of that type is asked for, so it
    // is an admin act rather than a registrar's daily work.
    const denied = schoolPermissionDenial(session, "schools.students", "configure");
    if (denied) return errorResponse(denied, 403);

    const companyId = session.user.companyId;
    const data = fieldDefinitionInputSchema.parse(await request.json());

    if (!schoolEntity(data.entity)) {
      return errorResponse(
        `${data.entity} is not a school record type. One of: ${SCHOOL_RECORD_TYPES.join(", ")}`,
        400,
      );
    }

    const errors = validateDefinition(data);
    if (errors.length > 0) return errorResponse("Validation failed", 400, errors);

    // Derived from the label unless given, and immutable afterwards — it is the
    // JSON key every stored value is filed under.
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
    console.error("[API] POST /api/v2/schools/field-definitions error:", error);
    return errorResponse("Failed to create field definition");
  }
}
