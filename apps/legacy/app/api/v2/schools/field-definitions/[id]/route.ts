import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { fieldOptionSchema } from "@corelithzw/module-records/custom-fields";
import { prisma } from "@corelithzw/db/client";
import { SCHOOL_RECORD_TYPES } from "@corelithzw/module-campus/record-types";
import { schoolPermissionDenial } from "@corelithzw/module-campus/permissions";

/**
 * One of a school's own fields, edited or retired.
 *
 * The sibling route could create fields and nothing could change or remove one,
 * so a typo in a label was permanent and a field added by mistake stayed on
 * every pupil form for ever. Same shape as the CRM route this borrows its engine
 * from, narrowed the same two ways the list route is: it will only answer for a
 * school record type, and it gates on `schools.students` / `configure` rather
 * than on a CRM capability.
 */

const updateSchema = z
  .object({
    label: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    isRequired: z.boolean().optional(),
    options: z.array(fieldOptionSchema).max(100).nullable().optional(),
    section: z.string().trim().max(80).nullable().optional(),
    position: z.number().int().min(0).max(999).optional(),
    showInTable: z.boolean().optional(),
    /** Restore a previously archived field. */
    archived: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.students", "configure");
    if (denied) return errorResponse(denied, 403);

    const { id } = await params;

    const existing = await prisma.crmFieldDefinition.findFirst({
      where: {
        id,
        companyId: session.user.companyId,
        entity: { in: [...SCHOOL_RECORD_TYPES] },
      },
      select: { id: true },
    });
    if (!existing) return errorResponse("Field not found", 404);

    const data = updateSchema.parse(await request.json());

    // The key and the type stay immutable, as they are in CRM: values already
    // stored under this key were coerced to this type, and changing either
    // strands them on the records that carry them.
    const updated = await prisma.crmFieldDefinition.update({
      where: { id: existing.id },
      data: {
        label: data.label,
        description: data.description,
        isRequired: data.isRequired,
        options: (data.options ?? undefined) as never,
        section: data.section,
        position: data.position,
        showInTable: data.showInTable,
        ...(data.archived !== undefined
          ? { archivedAt: data.archived ? new Date() : null }
          : {}),
      },
    });

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] PATCH /api/v2/schools/field-definitions/[id] error:", error);
    return errorResponse("Failed to update the field");
  }
}

/**
 * Archives rather than deletes. What every pupil already had recorded under
 * this key stays on their record; the field just stops being asked for.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.students", "configure");
    if (denied) return errorResponse(denied, 403);

    const { id } = await params;

    const existing = await prisma.crmFieldDefinition.findFirst({
      where: {
        id,
        companyId: session.user.companyId,
        entity: { in: [...SCHOOL_RECORD_TYPES] },
      },
      select: { id: true },
    });
    if (!existing) return errorResponse("Field not found", 404);

    await prisma.crmFieldDefinition.update({
      where: { id: existing.id },
      data: { archivedAt: new Date() },
    });

    return successResponse({ id: existing.id, archived: true });
  } catch (error) {
    console.error("[API] DELETE /api/v2/schools/field-definitions/[id] error:", error);
    return errorResponse("Failed to archive the field");
  }
}
