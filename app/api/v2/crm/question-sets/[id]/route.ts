/**
 * One question section: read it, save the whole list, or archive it.
 *
 * PATCH takes the entire question list rather than one question at a time,
 * matching the intake form builder. An admin reorders three and renames a
 * fourth in one sitting; four separate saves would leave the section in
 * states nobody asked for if one of them failed.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import {
  QuestionEditError,
  questionSetDraftSchema,
  saveQuestionSet,
} from "@/lib/crm/site-visits/question-editing";
import { requireCrmCapability } from "../../_helpers";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { companyId } = session.user;
    const { id } = await params;

    const set = await prisma.crmQuestionSet.findFirst({
      where: { id, companyId },
      include: {
        questions: { where: { archivedAt: null }, orderBy: { position: "asc" } },
        product: { select: { id: true, name: true } },
      },
    });
    if (!set) return errorResponse("Section not found", 404);

    // Which questions are already answered somewhere, so the editor can say
    // why a key is locked rather than just disabling the input.
    const answered = await prisma.crmSiteVisitAnswer.groupBy({
      by: ["questionId"],
      where: { companyId, questionId: { in: set.questions.map((question) => question.id) } },
      _count: { _all: true },
    });
    const answerCounts = Object.fromEntries(
      answered.filter((row) => row.questionId).map((row) => [row.questionId!, row._count._all]),
    );

    return successResponse({
      set,
      answerCounts,
      canEdit: await requireCrmCapability(session, "settings.manage"),
    });
  } catch (error) {
    console.error("[API] GET /api/v2/crm/question-sets/[id] error:", error);
    return errorResponse("Failed to load the section");
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { companyId } = session.user;
    const { id } = await params;

    if (!(await requireCrmCapability(session, "settings.manage"))) {
      return errorResponse("You cannot change the site-visit questions", 403);
    }

    const draft = questionSetDraftSchema.parse(await request.json());

    if (draft.productId) {
      const product = await prisma.product.findFirst({
        where: { id: draft.productId, companyId },
        select: { id: true },
      });
      if (!product) return errorResponse("Product not found", 404);
    }

    const set = await prisma.$transaction((tx) =>
      saveQuestionSet(tx, companyId, id, draft),
    );

    return successResponse({ set });
  } catch (error) {
    if (error instanceof QuestionEditError) {
      return errorResponse(error.message, 409);
    }
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] PATCH /api/v2/crm/question-sets/[id] error:", error);
    return errorResponse("Failed to save the section");
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { companyId } = session.user;
    const { id } = await params;

    if (!(await requireCrmCapability(session, "settings.manage"))) {
      return errorResponse("You cannot change the site-visit questions", 403);
    }

    const set = await prisma.crmQuestionSet.findFirst({
      where: { id, companyId },
      select: { id: true },
    });
    if (!set) return errorResponse("Section not found", 404);

    // Archived, never deleted. Visits already written up point at this set,
    // and `CrmSiteVisitSection.questionSetId` is SetNull — losing the row
    // would leave those reports unable to say which section they came from.
    const archived = await prisma.crmQuestionSet.update({
      where: { id },
      data: { archivedAt: new Date(), isActive: false },
    });

    return successResponse({ set: archived });
  } catch (error) {
    console.error("[API] DELETE /api/v2/crm/question-sets/[id] error:", error);
    return errorResponse("Failed to archive the section");
  }
}
