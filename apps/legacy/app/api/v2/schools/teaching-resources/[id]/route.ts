import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  errorResponse,
  isValidUUID,
  successResponse,
  validateSession,
} from "@/lib/api-utils";
import { prisma } from "@corelithzw/db/client";
import { schoolPermissionDenial } from "@/lib/schools/permissions";

const updateSchema = z
  .object({
    title: z.string().trim().min(1).max(300).optional(),
    description: z.string().trim().max(2000).nullish(),
    subjectId: z.string().uuid().nullish(),
    classId: z.string().uuid().nullish(),
    fileUrl: z.string().url().max(2000).nullish(),
    linkUrl: z.string().url().max(2000).nullish(),
    isShared: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

const resourceSelect = {
  id: true,
  title: true,
  description: true,
  fileUrl: true,
  linkUrl: true,
  mimeType: true,
  fileSize: true,
  isShared: true,
  createdAt: true,
  subject: { select: { id: true, code: true, name: true } },
  class: { select: { id: true, name: true } },
  uploadedBy: { select: { id: true, user: { select: { name: true } } } },
};

/**
 * Correcting and clearing a shelf entry.
 *
 * The shelf could only be added to. A worksheet filed under the wrong subject
 * stayed there for ever and a dead link stayed on the shelf looking usable,
 * which is how a staff room stops trusting the shelf and goes back to memory
 * sticks. Both verbs are the `edit` grant rather than a narrower "yours only"
 * rule: a head of department tidying the department's shelf is the ordinary
 * case, and ownership is already on the row for anyone who wants to ask first.
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.academics", "edit");
    if (denied) return errorResponse(denied, 403);

    const { id } = await context.params;
    if (!isValidUUID(id)) return errorResponse("Invalid resource id", 400);

    const existing = await prisma.schoolTeachingResource.findFirst({
      where: { id, companyId: session.user.companyId },
      select: { id: true, fileUrl: true, linkUrl: true },
    });
    if (!existing) return errorResponse("Resource not found", 404);

    const validated = updateSchema.parse(await request.json());

    // A resource is a pointer at something. Editing one down to neither a file
    // nor a link would leave a title on the shelf that opens nothing, so the
    // check is made against the record as it would end up rather than against
    // the patch alone.
    const fileUrl =
      validated.fileUrl === undefined ? existing.fileUrl : validated.fileUrl;
    const linkUrl =
      validated.linkUrl === undefined ? existing.linkUrl : validated.linkUrl;
    if (!fileUrl && !linkUrl) {
      return errorResponse("A resource needs a file or a link", 400);
    }

    const updated = await prisma.schoolTeachingResource.update({
      where: { id: existing.id },
      data: validated,
      select: resourceSelect,
    });

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] PATCH /api/v2/schools/teaching-resources/[id] error:", error);
    return errorResponse("Failed to save the resource");
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.academics", "archive");
    if (denied) return errorResponse(denied, 403);

    const { id } = await context.params;
    if (!isValidUUID(id)) return errorResponse("Invalid resource id", 400);

    const existing = await prisma.schoolTeachingResource.findFirst({
      where: { id, companyId: session.user.companyId },
      select: { id: true },
    });
    if (!existing) return errorResponse("Resource not found", 404);

    // A hard delete. Nothing is written against a resource — no marks, no
    // homework — so a tombstone would only be a row the shelf had to learn to
    // hide, and the file it pointed at is not held here anyway.
    await prisma.schoolTeachingResource.delete({ where: { id: existing.id } });
    return successResponse({ id: existing.id });
  } catch (error) {
    console.error("[API] DELETE /api/v2/schools/teaching-resources/[id] error:", error);
    return errorResponse("Failed to take the resource off the shelf");
  }
}
