import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { hasCrmFullAccess } from "@/lib/crm/scope";
import { updateCommentSchema } from "@/lib/crm/collaboration";
import { extractMentionedUserIds } from "@/lib/crm/rich-text";

const authorSelect = { select: { id: true, name: true, email: true } } as const;

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;
    const { id } = await params;

    const existing = await prisma.crmComment.findFirst({
      where: { id, companyId },
      select: { id: true, createdById: true, body: true },
    });
    if (!existing) return errorResponse("Comment not found", 404);

    const data = updateCommentSchema.parse(await request.json());
    const isAuthor = existing.createdById === session.user.id;

    // Editing what somebody said is different from pinning or resolving it:
    // anyone on the record can curate the thread, only the author can rewrite
    // their own words.
    if (data.body !== undefined && !isAuthor) {
      return errorResponse("You can only edit your own comments", 403);
    }

    let mentionIds: string[] = [];
    if (data.body !== undefined && data.body !== existing.body) {
      const mentioned = extractMentionedUserIds(data.body);
      mentionIds = mentioned.length
        ? (
            await prisma.user.findMany({
              where: { id: { in: mentioned }, companyId },
              select: { id: true },
            })
          ).map((user) => user.id)
        : [];
    }

    const now = new Date();
    const comment = await prisma.$transaction(async (tx) => {
      const updated = await tx.crmComment.update({
        where: { id },
        data: {
          body: data.body,
          editedAt: data.body !== undefined && data.body !== existing.body ? now : undefined,
          isPinned: data.isPinned,
          resolvedAt:
            data.resolved === undefined ? undefined : data.resolved ? now : null,
          resolvedById:
            data.resolved === undefined ? undefined : data.resolved ? session.user.id : null,
        },
        include: {
          createdBy: authorSelect,
          resolvedBy: authorSelect,
          mentions: { select: { userId: true } },
        },
      });

      // An edit rewrites the mention set rather than adding to it, so removing
      // a name from the text actually removes them from the thread.
      if (data.body !== undefined && data.body !== existing.body) {
        await tx.crmMention.deleteMany({ where: { commentId: id } });
        if (mentionIds.length) {
          await tx.crmMention.createMany({
            data: mentionIds.map((userId) => ({ companyId, commentId: id, userId })),
            skipDuplicates: true,
          });
        }
      }

      return updated;
    });

    return successResponse(comment);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    console.error("[API] PATCH /api/v2/crm/comments/[id] error:", error);
    return errorResponse("Failed to update the comment");
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;

    const existing = await prisma.crmComment.findFirst({
      where: { id, companyId: session.user.companyId },
      select: { id: true, createdById: true },
    });
    if (!existing) return errorResponse("Comment not found", 404);

    if (existing.createdById !== session.user.id && !hasCrmFullAccess(session.user.role)) {
      return errorResponse("You can only delete your own comments", 403);
    }

    // Replies cascade with the parent — a thread without its opening line is
    // worse than no thread at all.
    await prisma.crmComment.delete({ where: { id } });
    return successResponse({ id });
  } catch (error) {
    console.error("[API] DELETE /api/v2/crm/comments/[id] error:", error);
    return errorResponse("Failed to delete the comment");
  }
}
