import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { ensureCrmDocument } from "@/lib/books/crm-document-bridge";
import { getOrCreateApproval, rotateApproval } from "@/lib/crm/approvals";
import { canUser, denialMessage } from "@/lib/crm/permissions";
import { prisma } from "@/lib/prisma";

const bodySchema = z
  .object({
    expiresInDays: z.number().int().min(1).max(90).optional(),
    rotate: z.boolean().optional(),
  })
  .optional();

type RouteParams = { params: Promise<{ ownerId: string; docId: string }> };

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { docId } = await params;

    if (!(await canUser(session, "documents.approve"))) {
      return errorResponse(denialMessage("documents.approve"), 403);
    }

    const ensured = await ensureCrmDocument(session.user.companyId, docId);
    if (!ensured) return errorResponse("Document not found", 404);

    const raw = await request.text();
    const parsed = raw ? bodySchema.parse(JSON.parse(raw)) : undefined;

    const link = await prisma.$transaction(async (tx) => {
      if (parsed?.rotate) {
        const token = await rotateApproval(tx, {
          companyId: session.user.companyId,
          leadDocumentId: ensured.id,
          expiresInDays: parsed?.expiresInDays,
        });
        return { token, issued: true };
      }
      return getOrCreateApproval(tx, {
        companyId: session.user.companyId,
        leadDocumentId: ensured.id,
        expiresInDays: parsed?.expiresInDays,
      });
    });

    return successResponse(
      { token: link.token, path: `/a/${link.token}`, issued: link.issued },
      201,
    );
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    console.error("[API] POST /api/books/crm/[ownerId]/documents/[docId]/approval error:", error);
    return errorResponse(error instanceof Error ? error.message : "Failed to issue approval link", 400);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { docId } = await params;

    if (!(await canUser(session, "documents.approve"))) {
      return errorResponse(denialMessage("documents.approve"), 403);
    }

    const ensured = await ensureCrmDocument(session.user.companyId, docId);
    if (!ensured) return errorResponse("Document not found", 404);

    await prisma.crmDocumentApproval.updateMany({
      where: { companyId: session.user.companyId, leadDocumentId: ensured.id },
      data: { status: "REVOKED" },
    });
    return successResponse({ docId: ensured.id, revoked: true });
  } catch (error) {
    console.error("[API] DELETE /api/books/crm/[ownerId]/documents/[docId]/approval error:", error);
    return errorResponse(error instanceof Error ? error.message : "Failed to revoke approval link", 400);
  }
}
