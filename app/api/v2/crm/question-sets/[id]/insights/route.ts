/**
 * What a site-visit form's visits say about it (GET), and the one change the
 * insights suggest — making a question required (POST { require: key }).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { loadFormInsights } from "@/lib/crm/site-visits/insights";
import { requireCrmCapability } from "../../../_helpers";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;
    const found = await prisma.$transaction((tx) => loadFormInsights(tx, session.user.companyId, id));
    if (!found) return errorResponse("Form not found", 404);
    return successResponse({ ...found, canEdit: await requireCrmCapability(session, "settings.manage") });
  } catch (error) {
    console.error("[API] GET /api/v2/crm/question-sets/[id]/insights error:", error);
    return errorResponse("Failed to read the form's visits");
  }
}

const requireSchema = z.object({ require: z.string().min(1).max(64) }).strict();

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { companyId } = session.user;
    const { id } = await params;
    if (!(await requireCrmCapability(session, "settings.manage"))) {
      return errorResponse("You cannot change the site-visit questions", 403);
    }
    const { require } = requireSchema.parse(await request.json());
    const updated = await prisma.crmQuestion.updateMany({
      where: { companyId, questionSetId: id, key: require, archivedAt: null },
      data: { isRequired: true },
    });
    if (updated.count === 0) return errorResponse("That question is not on the form", 404);
    // A human has changed it; it is the tenant's now, not the template's.
    await prisma.crmQuestionSet.update({ where: { id }, data: { sourceTemplateKey: null } });
    return successResponse({ required: require });
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    console.error("[API] POST /api/v2/crm/question-sets/[id]/insights error:", error);
    return errorResponse("Failed to change the question");
  }
}
