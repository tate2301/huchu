import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { canEditRecord } from "@corelithzw/module-crm/permissions";

const OUTBOUND_TYPES = new Set(["CALL", "EMAIL", "WHATSAPP", "MEETING"]);

const createSchema = z.object({
  type: z.enum(["NOTE", "CALL", "EMAIL", "WHATSAPP", "MEETING"]),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().max(4000).optional(),
});

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;

    const lead = await prisma.crmLead.findFirst({
      where: { id, companyId: session.user.companyId },
      select: { id: true },
    });
    if (!lead) return errorResponse("Lead not found", 404);

    const activities = await prisma.crmActivity.findMany({
      where: { companyId: session.user.companyId, leadId: id },
      orderBy: { occurredAt: "desc" },
      take: 200,
    });
    return successResponse({ data: activities });
  } catch (error) {
    console.error("[API] GET /api/v2/crm/leads/[id]/activities error:", error);
    return errorResponse("Failed to fetch activities");
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;

    const lead = await prisma.crmLead.findFirst({
      where: { id, companyId: session.user.companyId },
      select: { id: true, clientId: true, assignedToId: true, firstContactAt: true },
    });
    if (!lead) return errorResponse("Lead not found", 404);
    if (!await canEditRecord(session, lead.assignedToId)) {
      return errorResponse("You can only log activity on leads assigned to you", 403);
    }

    const data = createSchema.parse(await request.json());

    const activity = await prisma.$transaction(async (tx) => {
      const created = await tx.crmActivity.create({
        data: {
          companyId: session.user.companyId,
          type: data.type,
          leadId: id,
          clientId: lead.clientId ?? undefined,
          subject: data.subject,
          body: data.body ?? undefined,
          createdById: session.user.id,
        },
      });
      // First outbound touch sets the response-time clock.
      if (!lead.firstContactAt && OUTBOUND_TYPES.has(data.type)) {
        await tx.crmLead.update({ where: { id }, data: { firstContactAt: new Date() } });
      }
      return created;
    });

    return successResponse(activity, 201);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    console.error("[API] POST /api/v2/crm/leads/[id]/activities error:", error);
    return errorResponse("Failed to log activity");
  }
}
