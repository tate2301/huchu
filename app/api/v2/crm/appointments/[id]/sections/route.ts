/**
 * The question sections on a site visit.
 *
 * GET returns what the rep can open (the tenant's question sets, seeded on
 * first read) alongside what they have already opened and answered. POST opens
 * a section — "we are quoting epoxy here too" — which is the moment the epoxy
 * questions appear on the rep's phone.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { canEditRecord } from "@/lib/crm/permissions";
import { questionSetsForVisit } from "@/lib/crm/site-visits/question-sets";

const createSectionSchema = z.object({
  questionSetId: z.string().uuid(),
  /**
   * Generated on the device. A section opened with no signal and replayed on
   * reconnect must not open twice, and the rep's answers are keyed to it.
   */
  clientSectionId: z.string().uuid().optional(),
});

async function loadVisit(companyId: string, id: string) {
  return prisma.crmAppointment.findFirst({
    where: { id, companyId },
    select: { id: true, assignedToId: true },
  });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;
    const { companyId } = session.user;

    const visit = await loadVisit(companyId, id);
    if (!visit) return errorResponse("Site visit not found", 404);

    // Seeds the tenant's question sets on first use, the way the deal board
    // ensures a pipeline exists before it reads one.
    const available = await prisma.$transaction((tx) => questionSetsForVisit(tx, companyId));

    const sections = await prisma.crmSiteVisitSection.findMany({
      where: { companyId, appointmentId: id },
      orderBy: { position: "asc" },
      include: {
        answers: { orderBy: { position: "asc" } },
        questionSet: {
          include: {
            questions: {
              where: { archivedAt: null },
              orderBy: { position: "asc" },
            },
          },
        },
        photos: { orderBy: { createdAt: "asc" } },
      },
    });

    return successResponse({
      available: {
        product: available.product.map(toSetSummary),
        evidence: available.evidence.map(toSetSummary),
        closeout: available.closeout.map(toSetSummary),
      },
      sections,
    });
  } catch (error) {
    console.error("[API] GET /api/v2/crm/appointments/[id]/sections error:", error);
    return errorResponse("Failed to load site visit questions");
  }
}

function toSetSummary(set: {
  id: string;
  key: string;
  name: string;
  kind: string;
  productId: string | null;
  questions: unknown[];
}) {
  return {
    id: set.id,
    key: set.key,
    name: set.name,
    kind: set.kind,
    productId: set.productId,
    questionCount: set.questions.length,
  };
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;
    const { companyId } = session.user;

    const visit = await loadVisit(companyId, id);
    if (!visit) return errorResponse("Site visit not found", 404);
    if (!(await canEditRecord(session, visit.assignedToId))) {
      return errorResponse("You can only write up site visits assigned to you", 403);
    }

    const data = createSectionSchema.parse(await request.json());

    const set = await prisma.crmQuestionSet.findFirst({
      where: { id: data.questionSetId, companyId, archivedAt: null },
      include: { questions: { where: { archivedAt: null }, orderBy: { position: "asc" } } },
    });
    if (!set) return errorResponse("Question set not found", 404);

    const section = await prisma.$transaction(async (tx) => {
      // Opening the same set twice on one visit is a mistake, not an intent:
      // return what is already there rather than splitting the answers.
      const existing = await tx.crmSiteVisitSection.findFirst({
        where: { companyId, appointmentId: id, questionSetId: set.id },
      });
      if (existing) return existing;

      const count = await tx.crmSiteVisitSection.count({
        where: { companyId, appointmentId: id },
      });

      return tx.crmSiteVisitSection.create({
        data: {
          companyId,
          appointmentId: id,
          questionSetId: set.id,
          productId: set.productId,
          // Snapshotted so an old report reads correctly after a rename.
          name: set.name,
          kind: set.kind,
          position: count,
        },
      });
    });

    return successResponse({ section, questions: set.questions }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/v2/crm/appointments/[id]/sections error:", error);
    return errorResponse("Failed to open the section");
  }
}
