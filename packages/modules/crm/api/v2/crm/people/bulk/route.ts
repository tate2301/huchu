import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { recordEditor } from "../../../../../permissions";

const MAX_BULK_IDS = 100;

const bulkSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("assign"),
    ids: z.array(z.string().uuid()).min(1).max(MAX_BULK_IDS),
    assignedToId: z.string().uuid().nullable(),
  }),
  z.object({
    action: z.literal("archive"),
    ids: z.array(z.string().uuid()).min(1).max(MAX_BULK_IDS),
  }),
]);

/**
 * Act on a set of people at once.
 *
 * Modelled on the leads bulk route down to its manners: a rep may only touch
 * their own or unclaimed records, and rather than failing the whole batch
 * because one row was somebody else's, it does what it may and reports back
 * how many it left alone. A partial result you can see beats a refusal you
 * have to reverse-engineer.
 */
export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const body = bulkSchema.parse(await request.json());

    const people = await prisma.crmPerson.findMany({
      where: { id: { in: body.ids }, companyId: session.user.companyId },
      select: { id: true, assignedToId: true },
    });

    const mayEdit = await recordEditor(session);
    const editable = people.filter((person) => mayEdit(person.assignedToId));
    const skipped = people.length - editable.length;
    const notFound = body.ids.length - people.length;

    if (editable.length === 0) {
      return errorResponse("None of the selected people can be edited by you", 403);
    }

    const ids = editable.map((person) => person.id);

    if (body.action === "assign") {
      // The owner has to be a real member of this company, or a bad id would
      // quietly detach every one of these records from anybody.
      if (body.assignedToId) {
        const owner = await prisma.user.findFirst({
          where: { id: body.assignedToId, companyId: session.user.companyId },
          select: { id: true },
        });
        if (!owner) return errorResponse("That owner is not on this team", 400);
      }

      await prisma.crmPerson.updateMany({
        where: { id: { in: ids } },
        data: { assignedToId: body.assignedToId },
      });
    } else {
      await prisma.crmPerson.updateMany({
        where: { id: { in: ids } },
        data: { archivedAt: new Date() },
      });
    }

    return successResponse({ updated: ids.length, skipped, notFound });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Invalid request", 400);
    }
    console.error("[API] POST /api/v2/crm/people/bulk error:", error);
    return errorResponse("Failed to update the selected people");
  }
}
