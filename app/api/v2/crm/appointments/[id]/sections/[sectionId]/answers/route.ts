/**
 * Saving the answers in one section of a site visit.
 *
 * PUT rather than POST, and an upsert underneath: a rep on a bad connection
 * sends the same batch more than once, and the second send must land on the
 * same rows. The unique key on (sectionId, questionKey) makes that true in the
 * database rather than only in the handler.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { canEditRecord } from "@/lib/crm/permissions";
import { answerInputSchema, saveAnswers } from "@/lib/crm/site-visits/answers";

const bodySchema = z.object({
  answers: z.array(answerInputSchema).max(200),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sectionId: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id, sectionId } = await params;
    const { companyId } = session.user;

    const visit = await prisma.crmAppointment.findFirst({
      where: { id, companyId },
      select: { id: true, assignedToId: true },
    });
    if (!visit) return errorResponse("Site visit not found", 404);
    if (!(await canEditRecord(session, visit.assignedToId))) {
      return errorResponse("You can only write up site visits assigned to you", 403);
    }

    const section = await prisma.crmSiteVisitSection.findFirst({
      where: { id: sectionId, companyId, appointmentId: id },
      select: { id: true },
    });
    if (!section) return errorResponse("Section not found", 404);

    const data = bodySchema.parse(await request.json());

    const written = await prisma.$transaction((tx) =>
      saveAnswers(
        { tx, companyId, sectionId, answeredById: session.user.id },
        data.answers,
      ),
    );

    const answers = await prisma.crmSiteVisitAnswer.findMany({
      where: { companyId, sectionId },
      orderBy: { position: "asc" },
    });

    return successResponse({ written, answers });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] PUT .../sections/[sectionId]/answers error:", error);
    return errorResponse("Failed to save answers");
  }
}
