/**
 * The tenant's site-visit question sections.
 *
 * Reading is open to anybody who can see the CRM — a rep about to do a visit
 * has a fair reason to look at what they will be asked. Writing is gated on
 * `settings.manage`, because these questions are what every quotation is
 * priced from and a careless edit is felt on every visit afterwards.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { createQuestionSetSchema } from "@/lib/crm/site-visits/question-editing";
import { ensureSiteVisitQuestionSets } from "@/lib/crm/site-visits/question-sets";
import { requireCrmCapability } from "../_helpers";

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { companyId } = session.user;

    // Seeds on first read, the same as the visit page does, so a tenant that
    // has never opened a visit still finds their questions here.
    await prisma.$transaction((tx) => ensureSiteVisitQuestionSets(tx, companyId));

    const sets = await prisma.crmQuestionSet.findMany({
      where: { companyId, archivedAt: null },
      orderBy: [{ kind: "asc" }, { position: "asc" }],
      include: {
        product: { select: { id: true, name: true } },
        _count: { select: { questions: { where: { archivedAt: null } } } },
      },
    });

    return successResponse({
      data: sets.map((set) => ({
        id: set.id,
        key: set.key,
        name: set.name,
        kind: set.kind,
        isActive: set.isActive,
        product: set.product,
        /** Null once a human has edited it — it is the tenant's now. */
        sourceTemplateKey: set.sourceTemplateKey,
        questionCount: set._count.questions,
      })),
      canEdit: await requireCrmCapability(session, "settings.manage"),
    });
  } catch (error) {
    console.error("[API] GET /api/v2/crm/question-sets error:", error);
    return errorResponse("Failed to load the question sections");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { companyId } = session.user;

    if (!(await requireCrmCapability(session, "settings.manage"))) {
      return errorResponse("You cannot change the site-visit questions", 403);
    }

    const data = createQuestionSetSchema.parse(await request.json());

    if (data.productId) {
      const product = await prisma.product.findFirst({
        where: { id: data.productId, companyId },
        select: { id: true },
      });
      if (!product) return errorResponse("Product not found", 404);
    }

    const clash = await prisma.crmQuestionSet.findFirst({
      where: { companyId, key: data.key },
      select: { id: true, archivedAt: true },
    });
    if (clash) {
      return errorResponse(
        clash.archivedAt
          ? `"${data.key}" belonged to an archived section. Pick another key.`
          : `A section with the key "${data.key}" already exists.`,
        409,
      );
    }

    const position = await prisma.crmQuestionSet.count({ where: { companyId } });

    const set = await prisma.crmQuestionSet.create({
      data: {
        companyId,
        key: data.key,
        name: data.name,
        kind: data.kind,
        productId: data.productId ?? null,
        position,
        createdById: session.user.id,
      },
    });

    return successResponse({ set }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/v2/crm/question-sets error:", error);
    return errorResponse("Failed to create the section");
  }
}
