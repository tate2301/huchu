import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@corelithzw/db/client";

/**
 * S-6.12 — what the school has said, and whether this parent has read it.
 *
 * Notices reach a parent as notifications, which already carry per-recipient read
 * state — so this is the existing pipeline with a parent-shaped door on it rather
 * than a second notice system. When S-9.6 gives the school a notice entity with
 * audience targeting, this route's shape does not have to change: it is already
 * "the things addressed to me, newest first, with read state".
 *
 * No role or consent gate: a notice is addressed to this user by the school. The
 * scope is the recipient row itself, which is the tightest scope there is — a
 * parent can only ever read their own.
 */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const now = new Date();
    const rows = await prisma.notificationRecipient.findMany({
      where: {
        userId: session.user.id,
        isArchived: false,
        notification: {
          companyId: session.user.companyId,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
      },
      orderBy: { createdAt: "desc" },
      take: 60,
      select: {
        id: true,
        isRead: true,
        readAt: true,
        notification: {
          select: {
            id: true,
            title: true,
            summary: true,
            severity: true,
            type: true,
            createdAt: true,
          },
        },
      },
    });

    return successResponse({
      notices: rows.map((row) => ({
        id: row.id,
        title: row.notification.title,
        summary: row.notification.summary,
        severity: row.notification.severity,
        type: row.notification.type,
        sentAt: row.notification.createdAt.toISOString(),
        isRead: row.isRead,
      })),
      unread: rows.filter((row) => !row.isRead).length,
    });
  } catch (error) {
    console.error("[API] GET /api/v2/schools/portal/parent/notices error:", error);
    return errorResponse("Failed to load notices");
  }
}

const readSchema = z.object({
  /** Empty means "all of them" — the prototype's Mark all read. */
  ids: z.array(z.string().uuid()).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const body = readSchema.parse(await request.json().catch(() => ({})));

    // Scoped to this user's own recipient rows, so an id from somebody else's
    // notice matches nothing rather than marking their post read.
    const result = await prisma.notificationRecipient.updateMany({
      where: {
        userId: session.user.id,
        isRead: false,
        ...(body.ids && body.ids.length > 0 ? { id: { in: body.ids } } : {}),
      },
      data: { isRead: true, readAt: new Date() },
    });

    return successResponse({ marked: result.count });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/v2/schools/portal/parent/notices error:", error);
    return errorResponse("Failed to mark notices read");
  }
}
