import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { hasCrmFullAccess } from "@/lib/crm/scope";

const updateListSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  isShared: z.boolean().optional(),
  /** Records to add to the list. Already-present ids are ignored. */
  addRecordIds: z.array(z.string().uuid()).max(500).optional(),
  removeRecordIds: z.array(z.string().uuid()).max(500).optional(),
});

/** Only the list's author, or a CRM manager, may change or delete it. */
async function loadEditableList(
  companyId: string,
  userId: string,
  role: string | null | undefined,
  id: string,
) {
  const list = await prisma.crmList.findFirst({
    where: { id, companyId },
    select: { id: true, createdById: true, entity: true },
  });
  if (!list) return { list: null, allowed: false } as const;
  return { list, allowed: list.createdById === userId || hasCrmFullAccess(role) } as const;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;

    const list = await prisma.crmList.findFirst({
      where: {
        id,
        companyId: session.user.companyId,
        OR: [{ isShared: true }, { createdById: session.user.id }],
      },
      include: {
        createdBy: { select: { id: true, name: true } },
        members: { orderBy: { createdAt: "desc" }, select: { recordId: true, createdAt: true } },
      },
    });
    if (!list) return errorResponse("List not found", 404);

    return successResponse({
      ...list,
      // The caller fetches the records themselves through the record endpoint
      // for that entity, so membership is returned as plain ids.
      recordIds: list.members.map((member) => member.recordId),
    });
  } catch (error) {
    console.error("[API] GET /api/v2/crm/lists/[id] error:", error);
    return errorResponse("Failed to fetch the list");
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;
    const { id } = await params;

    const { list, allowed } = await loadEditableList(
      companyId,
      session.user.id,
      session.user.role,
      id,
    );
    if (!list) return errorResponse("List not found", 404);
    if (!allowed) return errorResponse("You can only change lists you created", 403);

    const data = updateListSchema.parse(await request.json());

    const updated = await prisma.$transaction(async (tx) => {
      if (data.addRecordIds?.length) {
        await tx.crmListMember.createMany({
          data: data.addRecordIds.map((recordId) => ({
            companyId,
            listId: id,
            recordId,
            addedById: session.user.id,
          })),
          // Adding a record already in the list is a no-op, not an error.
          skipDuplicates: true,
        });
      }
      if (data.removeRecordIds?.length) {
        await tx.crmListMember.deleteMany({
          where: { listId: id, recordId: { in: data.removeRecordIds } },
        });
      }

      return tx.crmList.update({
        where: { id },
        data: {
          name: data.name,
          description: data.description,
          isShared: data.isShared,
        },
        include: {
          createdBy: { select: { id: true, name: true } },
          _count: { select: { members: true } },
        },
      });
    });

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    console.error("[API] PATCH /api/v2/crm/lists/[id] error:", error);
    return errorResponse("Failed to update the list");
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;

    const { list, allowed } = await loadEditableList(
      session.user.companyId,
      session.user.id,
      session.user.role,
      id,
    );
    if (!list) return errorResponse("List not found", 404);
    if (!allowed) return errorResponse("You can only delete lists you created", 403);

    // Deleting a list removes the grouping, never the records in it.
    await prisma.crmList.delete({ where: { id } });
    return successResponse({ id });
  } catch (error) {
    console.error("[API] DELETE /api/v2/crm/lists/[id] error:", error);
    return errorResponse("Failed to delete the list");
  }
}
