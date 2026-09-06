import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";

/**
 * What was measured on this record's site visits, as quotable lines.
 *
 * The visit already fed a quotation once — at the moment somebody completed a
 * report and pressed "generate quotation", which prefilled every line in one
 * go. That is the right flow for the common case and no use at all for the
 * one that follows it: a quote that needs three of the measured items, one
 * catalogue product and a one-off, or a second quote raised a week later.
 *
 * So the measurements are also readable per line, and the quote builder
 * offers them alongside the catalogue.
 */
const querySchema = z
  .object({
    leadId: z.string().uuid().optional(),
    dealId: z.string().uuid().optional(),
  })
  // One or the other. Neither would return every measurement in the company.
  .refine((value) => Boolean(value.leadId) !== Boolean(value.dealId), {
    message: "Ask for one record",
  });

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      leadId: searchParams.get("leadId") ?? undefined,
      dealId: searchParams.get("dealId") ?? undefined,
    });
    if (!parsed.success) return errorResponse("Which record?", 400);

    const visits = await prisma.crmAppointment.findMany({
      where: {
        companyId: session.user.companyId,
        ...(parsed.data.leadId ? { leadId: parsed.data.leadId } : {}),
        ...(parsed.data.dealId ? { dealId: parsed.data.dealId } : {}),
        // A cancelled visit's measurements are of a job nobody did.
        status: { not: "CANCELLED" },
      },
      select: {
        appointmentNo: true,
        title: true,
        scheduledStart: true,
        visitItems: {
          orderBy: { position: "asc" },
          select: {
            id: true,
            description: true,
            quantity: true,
            unit: true,
            unitPrice: true,
            category: true,
          },
        },
      },
      orderBy: { scheduledStart: "desc" },
      take: 20,
    });

    const items = visits.flatMap((visit) =>
      visit.visitItems
        .filter((item) => item.description.trim())
        .map((item) => ({
          id: item.id,
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          unitPrice: item.unitPrice,
          category: item.category,
          // Named so two surveys of the same building stay distinguishable.
          visitLabel: visit.title || visit.appointmentNo,
        })),
    );

    return successResponse({ data: items });
  } catch (error) {
    console.error("[API] GET /api/v2/crm/visit-items error:", error);
    return errorResponse("Failed to load the measured items");
  }
}
