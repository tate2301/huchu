import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { canEditRecord } from "@corelithzw/module-crm/permissions";

/**
 * Who is on a deal.
 *
 * The related lists on a record page could show the people attached to a deal
 * and offered no way to attach one, which made every relationship on the page
 * something you had to have got right when the record was created. A deal
 * gains a decision maker in week three; that is the normal case, not an
 * exception.
 */
const addSchema = z.object({
  personId: z.string().uuid(),
  role: z
    .enum([
      "PRIMARY",
      "DECISION_MAKER",
      "FINANCE",
      "SITE",
      "TECHNICAL",
      "INFLUENCER",
      "REFERRER",
    ])
    .optional(),
  notes: z.string().trim().max(500).optional(),
});

async function editableDeal(companyId: string, id: string) {
  return prisma.crmDeal.findFirst({
    where: { id, companyId },
    select: { id: true, assignedToId: true },
  });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;
    const { id } = await params;

    const deal = await editableDeal(companyId, id);
    if (!deal) return errorResponse("Deal not found", 404);
    if (!(await canEditRecord(session, deal.assignedToId))) {
      return errorResponse("You can only change deals assigned to you", 403);
    }

    const data = addSchema.parse(await request.json());

    // Scoped to the company: a person id from another tenant is a 404, not a
    // row that quietly links across the boundary.
    const person = await prisma.crmPerson.findFirst({
      where: { id: data.personId, companyId },
      select: { id: true },
    });
    if (!person) return errorResponse("Person not found", 404);

    const role = data.role ?? "PRIMARY";
    const existing = await prisma.crmDealContact.findFirst({
      where: { dealId: id, personId: data.personId, role },
      select: { id: true },
    });
    if (existing) return errorResponse("That person is already on this deal in that role", 409);

    const contact = await prisma.crmDealContact.create({
      data: {
        companyId,
        dealId: id,
        personId: data.personId,
        role,
        notes: data.notes ?? undefined,
      },
      include: {
        person: { select: { id: true, fullName: true, jobTitle: true, phone: true } },
      },
    });

    return successResponse(contact, 201);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    console.error("[API] POST /api/v2/crm/deals/[id]/contacts error:", error);
    return errorResponse("Failed to add the person to this deal", 400);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;
    const { id } = await params;

    const deal = await editableDeal(companyId, id);
    if (!deal) return errorResponse("Deal not found", 404);
    if (!(await canEditRecord(session, deal.assignedToId))) {
      return errorResponse("You can only change deals assigned to you", 403);
    }

    const contactId = new URL(request.url).searchParams.get("contactId");
    if (!contactId) return errorResponse("contactId is required", 400);

    // deleteMany rather than delete: the company scope is part of the match,
    // so a contact id from elsewhere removes nothing instead of throwing.
    const removed = await prisma.crmDealContact.deleteMany({
      where: { id: contactId, dealId: id, companyId },
    });
    if (removed.count === 0) return errorResponse("That person is not on this deal", 404);

    return successResponse({ id: contactId });
  } catch (error) {
    console.error("[API] DELETE /api/v2/crm/deals/[id]/contacts error:", error);
    return errorResponse("Failed to remove the person from this deal", 400);
  }
}
