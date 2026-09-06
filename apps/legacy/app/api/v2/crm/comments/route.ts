import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import {
  collabRecordPath,
  collabRecordSchema,
  commentAudience,
  createCommentSchema,
  type CollabRecord,
} from "@/lib/crm/collaboration";
import { extractMentionedUserIds, toPlainText } from "@corelithzw/module-records/rich-text";
import {
  isValidReplyParent,
  subjectData,
  subjectFromEntity,
  subjectWhere,
} from "@corelithzw/module-records/subject";
import { emitCrmNotification } from "@/lib/notifications";
import { crmRecordExists } from "../_helpers";

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

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const parsed = collabRecordSchema.safeParse({
      entity: searchParams.get("entity"),
      recordId: searchParams.get("recordId"),
    });
    if (!parsed.success) return errorResponse("A record is required", 400);

    const subject = subjectFromEntity(parsed.data.entity, parsed.data.recordId);
    if (!subject) return errorResponse("A record is required", 400);

    const comments = await prisma.crmComment.findMany({
      where: {
        companyId: session.user.companyId,
        parentId: null,
        // S-4.2 — finds a comment filed under either scheme.
        ...subjectWhere("comment", subject),
      },
      include: commentInclude,
      // Pinned notes are the ones a new person on the account needs first.
      orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
      take: 100,
    });

    return successResponse(comments);
  } catch (error) {
    console.error("[API] GET /api/v2/crm/comments error:", error);
    return errorResponse("Failed to fetch comments");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;

    const data = createCommentSchema.parse(await request.json());
    const record: CollabRecord = { entity: data.entity, recordId: data.recordId };
    const writeSubject = subjectFromEntity(data.entity, data.recordId);
    if (!writeSubject) return errorResponse("A record is required", 400);

    if (!(await crmRecordExists(companyId, record))) {
      return errorResponse("Record not found", 404);
    }

    if (data.parentId) {
      const parent = await prisma.crmComment.findFirst({
        where: { id: data.parentId, companyId },
        select: {
          id: true,
          parentId: true,
          leadId: true,
          dealId: true,
          clientId: true,
          personId: true,
          siteId: true,
        },
      });
      if (!isValidReplyParent(parent ?? {}, writeSubject)) {
        return errorResponse("You can only reply to a comment on this record", 400);
      }
    }

    // Only people in this tenant can be mentioned — a stray id in the body
    // must not create a notification row pointing at a stranger.
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
          // Dual-write: the pair always, the legacy column where one exists.
          ...subjectData("comment", writeSubject),
        },
        include: commentInclude,
      });

      if (validMentions.length) {
        await tx.crmMention.createMany({
          data: validMentions.map((userId) => ({ companyId, commentId: created.id, userId })),
          skipDuplicates: true,
        });
      }

      // Commenting is a statement of interest, so the author starts following
      // the record without having to think about it.
      await tx.crmFollower.upsert({
        where: {
          userId_entity_recordId: {
            userId: session.user.id,
            entity: record.entity,
            recordId: record.recordId,
          },
        },
        create: {
          companyId,
          userId: session.user.id,
          entity: record.entity,
          recordId: record.recordId,
        },
        update: {},
      });

      return created;
    });

    const viewPath = collabRecordPath(record);
    const preview = toPlainText(data.body).slice(0, 160);
    const author = session.user.name ?? "Someone";

    if (validMentions.length) {
      await emitCrmNotification({
        companyId,
        recipientIds: validMentions.filter((id) => id !== session.user.id),
        type: "CRM_MENTIONED",
        title: `${author} mentioned you`,
        summary: preview,
        entityType: "CRM_COMMENT",
        entityId: comment.id,
        viewPath,
      });
    }

    const [followers, participants] = await Promise.all([
      prisma.crmFollower.findMany({
        where: { companyId, entity: record.entity, recordId: record.recordId },
        select: { userId: true },
      }),
      prisma.crmComment.findMany({
        where: { companyId, ...subjectWhere("comment", writeSubject) },
        select: { createdById: true },
        distinct: ["createdById"],
      }),
    ]);

    const audience = commentAudience({
      followerIds: followers.map((follower) => follower.userId),
      participantIds: participants.map((participant) => participant.createdById),
      mentionedIds: validMentions,
      authorId: session.user.id,
    });

    if (audience.length) {
      await emitCrmNotification({
        companyId,
        recipientIds: audience,
        type: "CRM_COMMENT_ADDED",
        title: `${author} commented`,
        summary: preview,
        entityType: "CRM_COMMENT",
        entityId: comment.id,
        viewPath,
      });
    }

    return successResponse(comment, 201);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    console.error("[API] POST /api/v2/crm/comments error:", error);
    return errorResponse("Failed to post the comment");
  }
}
