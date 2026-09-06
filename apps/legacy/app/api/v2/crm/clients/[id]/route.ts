import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { canEditRecord, canUser, denialMessage } from "@/lib/crm/permissions";
import { normalizeEmail, normalizePhoneE164 } from "@/lib/crm/phone";
import { isCompanyUser } from "../../_helpers";

const updateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  contactName: z.string().trim().max(200).nullable().optional(),
  email: z.string().trim().email().max(200).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  phoneCountry: z.string().trim().max(8).nullable().optional(),
  addressLine: z.string().trim().max(300).nullable().optional(),
  city: z.string().trim().max(120).nullable().optional(),
  country: z.string().trim().max(80).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  tags: z.array(z.string().trim().max(40)).max(20).optional(),
  assignedToId: z.string().uuid().nullable().optional(),
});

async function loadClient(companyId: string, id: string) {
  return prisma.crmClient.findFirst({ where: { id, companyId } });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;

    const client = await prisma.crmClient.findFirst({
      where: { id, companyId: session.user.companyId },
      include: {
        leads: { orderBy: { updatedAt: "desc" }, take: 50 },
        followUps: { where: { status: "PENDING" }, orderBy: { dueAt: "asc" }, take: 20 },
        activities: {
          orderBy: { occurredAt: "desc" },
          take: 50,
          // The history feed names who did it; without this every
          // entry reads as though it happened by itself.
          include: { createdBy: { select: { id: true, name: true } } },
        },
      },
    });
    if (!client) return errorResponse("Client not found", 404);
    return successResponse(client);
  } catch (error) {
    console.error("[API] GET /api/v2/crm/clients/[id] error:", error);
    return errorResponse("Failed to fetch client");
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;

    const existing = await loadClient(session.user.companyId, id);
    if (!existing) return errorResponse("Client not found", 404);
    if (!await canEditRecord(session, existing.assignedToId)) {
      return errorResponse("You can only edit clients assigned to you", 403);
    }

    const data = updateSchema.parse(await request.json());
    if (!(await isCompanyUser(session.user.companyId, data.assignedToId))) {
      return errorResponse("Invalid assignee", 400);
    }
    const updated = await prisma.crmClient.update({
      where: { id },
      data: {
        name: data.name,
        contactName: data.contactName ?? undefined,
        email: data.email ?? undefined,
        emailNormalized: data.email !== undefined ? normalizeEmail(data.email) ?? null : undefined,
        phone: data.phone ?? undefined,
        phoneE164:
          data.phone !== undefined ? normalizePhoneE164(data.phone, data.phoneCountry) ?? null : undefined,
        addressLine: data.addressLine ?? undefined,
        city: data.city ?? undefined,
        country: data.country ?? undefined,
        notes: data.notes ?? undefined,
        tags: data.tags ?? undefined,
        // null explicitly unassigns; undefined leaves unchanged.
        assignedToId: data.assignedToId === undefined ? undefined : data.assignedToId,
      },
    });
    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    console.error("[API] PATCH /api/v2/crm/clients/[id] error:", error);
    return errorResponse("Failed to update client");
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;

    const existing = await loadClient(session.user.companyId, id);
    if (!existing) return errorResponse("Client not found", 404);
    if (!await canEditRecord(session, existing.assignedToId)) {
      return errorResponse("You can only archive clients assigned to you", 403);
    }
    // Owning a record and being allowed to remove it are separate decisions.
    if (!(await canUser(session, "records.delete"))) {
      return errorResponse(denialMessage("records.delete"), 403);
    }

    await prisma.crmClient.update({ where: { id }, data: { archivedAt: new Date() } });
    return successResponse({ id, archived: true });
  } catch (error) {
    console.error("[API] DELETE /api/v2/crm/clients/[id] error:", error);
    return errorResponse("Failed to archive client");
  }
}
