import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { GROUP_ENTITIES } from "@/lib/crm/groups";
import { existingRecordIds } from "@/lib/crm/lists";
import { hasCrmFullAccess } from "@/lib/crm/scope";

const createListSchema = z.object({
  entity: z.enum(GROUP_ENTITIES),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).nullable().optional(),
  isShared: z.boolean().optional(),
  /** Seed the list with a selection made in the table. */
  recordIds: z.array(z.string().uuid()).max(500).optional(),
});

/**
 * Static lists — records someone put there by hand, as opposed to a saved
 * view's "whatever matches these filters". Keeping the two distinct is the
 * point: a campaign list shouldn't quietly change under you.
 */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const requested = searchParams.get("entity");
    const entity = GROUP_ENTITIES.find((value) => value === requested);
    // Asked from a record's page: which of these groups already hold it.
    const recordId = z.string().uuid().safeParse(searchParams.get("recordId")).data ?? null;

    const lists = await prisma.crmList.findMany({
      where: {
        companyId: session.user.companyId,
        ...(entity ? { entity } : {}),
        OR: [{ isShared: true }, { createdById: session.user.id }],
      },
      include: {
        createdBy: { select: { id: true, name: true } },
        _count: { select: { members: true } },
      },
      orderBy: [{ isShared: "desc" }, { name: "asc" }],
    });

    const holding = recordId
      ? new Set(
          (
            await prisma.crmListMember.findMany({
              where: { recordId, listId: { in: lists.map((list) => list.id) } },
              select: { listId: true },
            })
          ).map((member) => member.listId),
        )
      : null;

    // Whether this reader may add to (or rename, or delete) each group: its
    // author, or a CRM manager — the rule `PATCH /lists/:id` enforces.
    const manager = hasCrmFullAccess(session.user.role);
    return successResponse({
      data: lists.map((list) => ({
        ...list,
        canEdit: manager || list.createdById === session.user.id,
        ...(holding ? { contains: holding.has(list.id) } : {}),
      })),
    });
  } catch (error) {
    console.error("[API] GET /api/v2/crm/lists error:", error);
    return errorResponse("Failed to fetch lists");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;

    const data = createListSchema.parse(await request.json());

    const clash = await prisma.crmList.findFirst({
      where: { companyId, entity: data.entity, name: data.name },
      select: { id: true },
    });
    if (clash) return errorResponse("A list with that name already exists here", 409);

    const recordIds = data.recordIds?.length
      ? await existingRecordIds(prisma, { companyId, entity: data.entity, ids: data.recordIds })
      : [];

    const list = await prisma.crmList.create({
      data: {
        companyId,
        entity: data.entity,
        name: data.name,
        description: data.description ?? undefined,
        isShared: data.isShared ?? false,
        createdById: session.user.id,
        ...(recordIds.length > 0
          ? {
              members: {
                create: recordIds.map((recordId) => ({
                  companyId,
                  recordId,
                  addedById: session.user.id,
                })),
              },
            }
          : {}),
      },
      include: {
        createdBy: { select: { id: true, name: true } },
        _count: { select: { members: true } },
      },
    });

    return successResponse(list, 201);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    console.error("[API] POST /api/v2/crm/lists error:", error);
    return errorResponse("Failed to create the list");
  }
}
