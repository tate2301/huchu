import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import type { AuthenticatedSession } from "@/lib/auth-core/types";
import { canEditRecord } from "@/lib/crm/permissions";
import { canCustomiseLayouts, createCompanyLayout, isLayoutFor, layoutSchema, layoutsFor } from "@/lib/documents/layouts";
import { templateSchema } from "@/lib/documents/template-schema";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

/** The document, in this workspace, and whether this person may change how it prints. */
async function documentFor(session: AuthenticatedSession, id: string) {
  const doc = await prisma.crmLeadDocument.findFirst({
    where: { id, companyId: session.user.companyId },
    select: {
      id: true,
      type: true,
      renderTemplateId: true,
      lead: { select: { assignedToId: true } },
      deal: { select: { assignedToId: true } },
    },
  });
  if (!doc) return null;
  const mayChoose = await canEditRecord(session, doc.deal?.assignedToId ?? doc.lead?.assignedToId ?? null);
  return { doc, mayChoose };
}

/**
 * The document's layout: the one it prints in, the layouts it could, the
 * settings of the one it has (or of `?templateId=`), and whether this person
 * may choose another or make their own.
 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const found = await documentFor(session, (await params).id);
    if (!found) return errorResponse("Document not found", 404);
    const { doc, mayChoose } = found;
    const companyId = session.user.companyId;
    // `?templateId=` asks for another layout's settings, for the builder to start from; empty is the company default.
    const query = new URL(request.url).searchParams;
    let looking = doc.renderTemplateId;
    if (query.has("templateId")) {
      looking = query.get("templateId") || null;
      if (looking && !(await isLayoutFor(companyId, doc.type, looking))) return errorResponse("That layout is not for this kind of document", 400);
    }
    const [layouts, schema] = await Promise.all([layoutsFor(companyId, doc.type), layoutSchema(companyId, doc.type, looking)]);
    return successResponse({
      kind: doc.type,
      current: doc.renderTemplateId,
      layouts,
      schema,
      mayChoose,
      mayCustomise: mayChoose && canCustomiseLayouts(session.user.role),
    });
  } catch (error) {
    console.error("[API] GET /api/v2/crm/documents/[id]/layout error:", error);
    return errorResponse("Could not read the document's layout");
  }
}

const chooseSchema = z.object({ templateId: z.string().uuid().nullable() });

/** Prints the document in another layout; null is the company default. Its figures do not change. */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const found = await documentFor(session, (await params).id);
    if (!found) return errorResponse("Document not found", 404);
    if (!found.mayChoose) return errorResponse("You can only change documents on records assigned to you", 403);
    const { templateId } = chooseSchema.parse(await request.json());
    if (templateId && !(await isLayoutFor(session.user.companyId, found.doc.type, templateId))) {
      return errorResponse("That layout is not for this kind of document", 400);
    }
    await prisma.crmLeadDocument.update({ where: { id: found.doc.id }, data: { renderTemplateId: templateId } });
    return successResponse({ current: templateId });
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Choose a layout", 400, error.issues);
    console.error("[API] PATCH /api/v2/crm/documents/[id]/layout error:", error);
    return errorResponse("Could not change the layout");
  }
}

const saveSchema = z.object({ name: z.string().trim().min(1, "Name the layout").max(120), schema: templateSchema });

/** "Save as a layout": the settings made here, kept as the company's own layout, and this document printed in it. Managers. */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const found = await documentFor(session, (await params).id);
    if (!found) return errorResponse("Document not found", 404);
    if (!found.mayChoose || !canCustomiseLayouts(session.user.role)) {
      return errorResponse("Only a manager can make a layout", 403);
    }
    const body = saveSchema.parse(await request.json());
    const layout = await createCompanyLayout({
      companyId: session.user.companyId,
      userId: session.user.id,
      kind: found.doc.type,
      name: body.name,
      schema: body.schema,
    });
    await prisma.crmLeadDocument.update({ where: { id: found.doc.id }, data: { renderTemplateId: layout.id } });
    return successResponse({ layout, current: layout.id }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse(error.issues[0]?.message ?? "Validation failed", 400, error.issues);
    console.error("[API] POST /api/v2/crm/documents/[id]/layout error:", error);
    return errorResponse("Could not save the layout");
  }
}
