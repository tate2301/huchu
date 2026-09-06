import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@corelithzw/db";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { canUser, denialMessage } from "@corelithzw/module-crm/permissions";
import { prisma } from "@corelithzw/db/client";
import { isCompanyUser } from "../_helpers";

const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
  notes: z.string().trim().max(2000).optional(),
  dueAt: z.string().datetime(),
  leadId: z.string().uuid().nullable().optional(),
  clientId: z.string().uuid().nullable().optional(),
  dealId: z.string().uuid().nullable().optional(),
  appointmentId: z.string().uuid().nullable().optional(),
  assignedToId: z.string().uuid().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const assignedToId = searchParams.get("assignedToId");
    const overdue = searchParams.get("overdue") === "true";

    const where: Prisma.CrmFollowUpWhereInput = {
      companyId: session.user.companyId,
      ...(status ? { status: status as Prisma.CrmFollowUpWhereInput["status"] } : {}),
      ...(assignedToId ? { assignedToId } : {}),
      ...(overdue ? { status: "PENDING", dueAt: { lt: new Date() } } : {}),
    };

    const followUps = await prisma.crmFollowUp.findMany({
      where,
      include: {
        lead: { select: { id: true, leadNo: true, title: true } },
        client: { select: { id: true, name: true } },
        assignedTo: { select: { id: true, name: true } },
      },
      orderBy: { dueAt: "asc" },
      take: 500,
    });
    return successResponse({ data: followUps });
  } catch (error) {
    console.error("[API] GET /api/v2/crm/follow-ups error:", error);
    return errorResponse("Failed to fetch follow-ups");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const data = createSchema.parse(await request.json());
    if (!(await isCompanyUser(session.user.companyId, data.assignedToId))) {
      return errorResponse("Invalid assignee", 400);
    }
    // Putting work on somebody else's list is its own permission.
    if (
      data.assignedToId &&
      data.assignedToId !== session.user.id &&
      !(await canUser(session, "tasks.assign.others"))
    ) {
      return errorResponse(denialMessage("tasks.assign.others"), 403);
    }
    const followUp = await prisma.crmFollowUp.create({
      data: {
        companyId: session.user.companyId,
        title: data.title,
        notes: data.notes ?? undefined,
        dueAt: new Date(data.dueAt),
        leadId: data.leadId ?? undefined,
        clientId: data.clientId ?? undefined,
        dealId: data.dealId ?? undefined,
        appointmentId: data.appointmentId ?? undefined,
        assignedToId: data.assignedToId ?? session.user.id,
        createdById: session.user.id,
      },
    });
    return successResponse(followUp, 201);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    console.error("[API] POST /api/v2/crm/follow-ups error:", error);
    return errorResponse("Failed to create follow-up");
  }
}
