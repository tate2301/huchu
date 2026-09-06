import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@corelithzw/db/client";
import { canEditRecord } from "@/lib/crm/permissions";
import { convertLead, convertLeadSchema, splitName } from "@/lib/crm/conversion";
import { findCompanyDuplicates, findPersonDuplicates } from "@/lib/crm/duplicates";

/**
 * GET returns what the conversion screen needs to be filled in: the lead's
 * details plus any people and companies that look like the ones about to be
 * created. Showing those *before* the decision is the whole point — creating
 * the duplicate and merging it later is far more work.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;
    const { id } = await params;

    const lead = await prisma.crmLead.findFirst({
      where: { id, companyId },
      select: {
        id: true,
        leadNo: true,
        title: true,
        contactName: true,
        contactEmail: true,
        contactPhone: true,
        estimatedValue: true,
        currency: true,
        clientId: true,
        assignedToId: true,
        convertedAt: true,
        convertedDealId: true,
        client: { select: { id: true, name: true } },
      },
    });
    if (!lead) return errorResponse("Lead not found", 404);

    const name = splitName(lead.contactName);
    const [personDuplicates, companyDuplicates] = await Promise.all([
      findPersonDuplicates(prisma, {
        companyId,
        fullName: lead.contactName,
        email: lead.contactEmail,
        phone: lead.contactPhone,
        clientId: lead.clientId,
      }),
      // Guess a company name from the lead title only when there is nothing
      // better; a bad guess here produces noisy false matches.
      findCompanyDuplicates(prisma, {
        companyId,
        name: lead.client?.name ?? lead.title,
      }),
    ]);

    return successResponse({
      lead,
      suggested: {
        personFirstName: name.firstName,
        personLastName: name.lastName,
        dealTitle: lead.title ?? `${lead.contactName ?? "New"} opportunity`,
        companyName: lead.client?.name ?? "",
      },
      personDuplicates,
      companyDuplicates,
    });
  } catch (error) {
    console.error("[API] GET /api/v2/crm/leads/[id]/convert error:", error);
    return errorResponse("Failed to prepare conversion");
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;
    const { id } = await params;

    const lead = await prisma.crmLead.findFirst({
      where: { id, companyId },
      select: { id: true, assignedToId: true, convertedAt: true },
    });
    if (!lead) return errorResponse("Lead not found", 404);
    if (lead.convertedAt) return errorResponse("This lead has already been converted", 409);
    if (!await canEditRecord(session, lead.assignedToId)) {
      return errorResponse("You can only convert leads assigned to you", 403);
    }

    const input = convertLeadSchema.parse(await request.json());

    // Anything the caller asked to reuse has to be in this tenant.
    if (input.personId) {
      const person = await prisma.crmPerson.findFirst({
        where: { id: input.personId, companyId },
        select: { id: true },
      });
      if (!person) return errorResponse("Invalid person", 400);
    }
    if (input.clientId) {
      const client = await prisma.crmClient.findFirst({
        where: { id: input.clientId, companyId },
        select: { id: true },
      });
      if (!client) return errorResponse("Invalid company", 400);
    }
    if (input.siteId) {
      const site = await prisma.crmSite.findFirst({
        where: { id: input.siteId, companyId },
        select: { id: true },
      });
      if (!site) return errorResponse("Invalid site", 400);
    }

    const result = await prisma.$transaction((tx) =>
      convertLead(tx, { companyId, userId: session.user.id, leadId: id, input }),
    );

    return successResponse(result, 201);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    console.error("[API] POST /api/v2/crm/leads/[id]/convert error:", error);
    return errorResponse(error instanceof Error ? error.message : "Failed to convert lead", 400);
  }
}
