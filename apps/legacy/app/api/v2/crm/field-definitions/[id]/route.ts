import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { fieldOptionSchema } from "@/lib/crm/custom-fields";
import { requireCrmCapability } from "../../_helpers";

const updateSchema = z.object({
  label: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  isRequired: z.boolean().optional(),
  defaultValue: z.unknown().optional(),
  options: z.array(fieldOptionSchema).max(100).nullable().optional(),
  section: z.string().trim().max(80).nullable().optional(),
  position: z.number().int().min(0).max(999).optional(),
  showInTable: z.boolean().optional(),
  /** Restore a previously archived field. */
  archived: z.boolean().optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    if (!await requireCrmCapability(session, "fields.manage")) {
      return errorResponse("Only managers can change custom fields", 403);
    }
    const { id } = await params;

    const existing = await prisma.crmFieldDefinition.findFirst({
      where: { id, companyId: session.user.companyId },
      select: { id: true, type: true },
    });
    if (!existing) return errorResponse("Field not found", 404);

    const data = updateSchema.parse(await request.json());

    // The key and the type are deliberately immutable: values already stored
    // under this key were coerced to this type, and changing either would
    // strand them.
    const updated = await prisma.crmFieldDefinition.update({
      where: { id },
      data: {
        label: data.label,
        description: data.description,
        isRequired: data.isRequired,
        defaultValue: (data.defaultValue ?? undefined) as never,
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
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    console.error("[API] PATCH /api/v2/crm/field-definitions/[id] error:", error);
    return errorResponse("Failed to update the field");
  }
}

/**
 * Archives rather than deletes. Values already recorded under this key stay on
 * their records, so archiving a field by mistake loses nothing — it just stops
 * appearing on forms.
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    if (!await requireCrmCapability(session, "fields.manage")) {
      return errorResponse("Only managers can archive custom fields", 403);
    }
    const { id } = await params;

    const existing = await prisma.crmFieldDefinition.findFirst({
      where: { id, companyId: session.user.companyId },
      select: { id: true },
    });
    if (!existing) return errorResponse("Field not found", 404);

    await prisma.crmFieldDefinition.update({
      where: { id },
      data: { archivedAt: new Date() },
    });

    return successResponse({ id, archived: true });
  } catch (error) {
    console.error("[API] DELETE /api/v2/crm/field-definitions/[id] error:", error);
    return errorResponse("Failed to archive the field");
  }
}
