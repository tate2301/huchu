import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@corelithzw/db";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { reserveIdentifier } from "@corelithzw/platform/id-generator";
import { isCompanyUser } from "../_helpers";

const createSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  leadId: z.string().uuid().nullable().optional(),
  clientId: z.string().uuid().nullable().optional(),
  // A visit is booked against a deal at least as often as against a lead, and
  // usually happens at a site. The columns were always there; the route just
  // dropped them, so the deal page passed its deal id in `leadId` and every
  // booking from a deal died on a foreign key.
  dealId: z.string().uuid().nullable().optional(),
  siteId: z.string().uuid().nullable().optional(),
  assignedToId: z.string().uuid().optional(),
  scheduledStart: z.string().datetime(),
  scheduledEnd: z.string().datetime().nullable().optional(),
  location: z.string().trim().max(300).nullable().optional(),
  // Carries the briefing written when the visit is booked; the report sheet
  // later replaces it with what actually happened.
  outcomeNotes: z.string().trim().max(2000).nullable().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const assignedToId = searchParams.get("assignedToId");
    const status = searchParams.get("status");

    const where: Prisma.CrmAppointmentWhereInput = {
      companyId: session.user.companyId,
      ...(assignedToId ? { assignedToId } : {}),
      ...(status ? { status: status as Prisma.CrmAppointmentWhereInput["status"] } : {}),
      ...(from || to
        ? {
            scheduledStart: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(to) } : {}),
            },
          }
        : {}),
    };

    const appointments = await prisma.crmAppointment.findMany({
      where,
      include: {
        lead: { select: { id: true, leadNo: true, title: true } },
        // The deal was stored and never read back, so a visit booked against
        // one showed on this list with nothing saying which job it was for.
        deal: { select: { id: true, dealNo: true, title: true } },
        client: { select: { id: true, name: true } },
        site: { select: { id: true, name: true } },
        assignedTo: { select: { id: true, name: true } },
      },
      orderBy: { scheduledStart: "asc" },
      take: 500,
    });
    return successResponse({ data: appointments });
  } catch (error) {
    console.error("[API] GET /api/v2/crm/appointments error:", error);
    return errorResponse("Failed to fetch appointments");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const data = createSchema.parse(await request.json());
    const companyId = session.user.companyId;
    if (!(await isCompanyUser(companyId, data.assignedToId))) {
      return errorResponse("Invalid assignee", 400);
    }

    // Everything the visit hangs off has to be in this tenant. Without this a
    // valid-looking uuid from anywhere reaches the database and comes back as
    // an opaque 500.
    const checks: Array<[string, string | null | undefined, () => Promise<unknown>]> = [
      ["lead", data.leadId, () => prisma.crmLead.findFirst({ where: { id: data.leadId!, companyId }, select: { id: true } })],
      ["deal", data.dealId, () => prisma.crmDeal.findFirst({ where: { id: data.dealId!, companyId }, select: { id: true } })],
      ["company", data.clientId, () => prisma.crmClient.findFirst({ where: { id: data.clientId!, companyId }, select: { id: true } })],
      ["site", data.siteId, () => prisma.crmSite.findFirst({ where: { id: data.siteId!, companyId }, select: { id: true } })],
    ];
    for (const [label, id, check] of checks) {
      if (!id) continue;
      if (!(await check())) return errorResponse(`That ${label} isn't in this workspace`, 400);
    }
    const appointmentNo = await reserveIdentifier(prisma, {
      companyId,
      entity: "CRM_APPOINTMENT",
    });

    const appointment = await prisma.crmAppointment.create({
      data: {
        companyId,
        appointmentNo,
        title: data.title ?? "Site visit",
        leadId: data.leadId ?? undefined,
        clientId: data.clientId ?? undefined,
        dealId: data.dealId ?? undefined,
        siteId: data.siteId ?? undefined,
        assignedToId: data.assignedToId ?? session.user.id,
        scheduledStart: new Date(data.scheduledStart),
        scheduledEnd: data.scheduledEnd ? new Date(data.scheduledEnd) : undefined,
        location: data.location ?? undefined,
        outcomeNotes: data.outcomeNotes ?? undefined,
        createdById: session.user.id,
      },
    });
    return successResponse(appointment, 201);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    console.error("[API] POST /api/v2/crm/appointments error:", error);
    return errorResponse("Failed to create appointment");
  }
}
