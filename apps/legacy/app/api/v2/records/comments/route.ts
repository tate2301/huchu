import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { extractMentionedUserIds } from "@/lib/crm/rich-text";
import {
  isValidReplyParent,
  recordSubjectSchema,
  subjectData,
  subjectWhere,
} from "@/lib/records/subject";

import { guardRecordSubject } from "../_guard";

/**
 * Comments on a record — any record, in any module.
 *
 * The same table as `/api/v2/crm/comments`; the difference is the door, which is
 * gated per subject type rather than on `crm.core` by URL prefix. See
 * `../_guard.ts` for why that matters.
 *
 * One level of nesting, deliberately: a reply must be to a top-level comment on
 * the same subject, so a thread stays readable rather than becoming a tree
 * nobody can follow on a phone.
 *
 * Notifications are NOT emitted here yet. `emitCrmNotification` and the
 * follower/participant audience in the CRM route are shaped around CRM
 * notification types, and a school comment firing a `CRM_COMMENT_ADDED` at a
 * class teacher would be worse than silence. Wiring a school audience is its own
 * change; this route says so rather than pretending.
 */

const authorSelect = { select: { id: true, name: true, email: true } } as const;

const commentInclude = {
  createdBy: authorSelect,
  resolvedBy: authorSelect,
  mentions: { select: { userId: true } },
  replies: {
    orderBy: { createdAt: "asc" },
    include: { createdBy: authorSelect, mentions: { select: { userId: true } } },
  },
} as const;

const createCommentSchema = recordSubjectSchema.extend({
  body: z.string().trim().min(1).max(10_000),
  parentId: z.string().uuid().nullish(),
});

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const parsed = recordSubjectSchema.safeParse({
      subjectType: searchParams.get("subjectType"),
      subjectId: searchParams.get("subjectId"),
    });
    if (!parsed.success) return errorResponse("A record is required", 400);

    const subject = { type: parsed.data.subjectType, id: parsed.data.subjectId };
    const guard = await guardRecordSubject(session, subject.type, "view");
    if (!guard.ok) return errorResponse(guard.message, guard.status);

    const comments = await prisma.crmComment.findMany({
      where: {
        companyId: session.user.companyId,
        parentId: null,
        ...subjectWhere("comment", subject),
      },
      include: commentInclude,
      // Pinned notes are the ones somebody new to this record needs first.
      orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
      take: 100,
    });

    return successResponse({ data: comments });
  } catch (error) {
    console.error("[API] GET /api/v2/records/comments error:", error);
    return errorResponse("Failed to load the comments");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const data = createCommentSchema.parse(await request.json());
    const subject = { type: data.subjectType, id: data.subjectId };
    const companyId = session.user.companyId;

    const guard = await guardRecordSubject(session, subject.type, "create");
    if (!guard.ok) return errorResponse(guard.message, guard.status);

    if (data.parentId) {
      const parent = await prisma.crmComment.findFirst({
        where: { id: data.parentId, companyId },
        select: {
          id: true,
          parentId: true,
          subjectType: true,
          subjectId: true,
          leadId: true,
          dealId: true,
          clientId: true,
          personId: true,
          siteId: true,
        },
      });
      if (!isValidReplyParent(parent ?? {}, subject)) {
        return errorResponse("You can only reply to a comment on this record", 400);
      }
    }

    // Only people in this tenant can be mentioned — a stray id in the body must
    // not create a notification row pointing at a stranger.
    const mentionedIds = extractMentionedUserIds(data.body);
    const validMentions = mentionedIds.length
      ? (
          await prisma.user.findMany({
            where: { id: { in: mentionedIds }, companyId },
            select: { id: true },
          })
        ).map((user) => user.id)
      : [];

    const comment = await prisma.$transaction(async (tx) => {
      const created = await tx.crmComment.create({
        data: {
          companyId,
          body: data.body,
          parentId: data.parentId ?? undefined,
          createdById: session.user.id,
          ...subjectData("comment", subject),
        },
        include: commentInclude,
      });

      if (validMentions.length) {
        await tx.crmMention.createMany({
          data: validMentions.map((userId) => ({
            companyId,
            commentId: created.id,
            userId,
          })),
          skipDuplicates: true,
        });
      }

      return created;
    });

    return successResponse(comment, 201);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    console.error("[API] POST /api/v2/records/comments error:", error);
    return errorResponse("Failed to add the comment");
  }
}
