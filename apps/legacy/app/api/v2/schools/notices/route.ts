import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { schoolPermissionDenial } from "@/lib/schools/permissions";
import { listSentNotices, NoticeError, sendSchoolNotice } from "@/lib/schools/notices";

const postSchema = z.object({
  title: z.string().trim().min(1).max(160),
  body: z.string().trim().min(1).max(4000),
  audience: z.enum(["ALL", "PARENTS", "STUDENTS", "TEACHERS"]),
  classId: z.string().uuid().nullish(),
  /**
   * A shortlist of pupils to write to the families of, for the boards that
   * have already named a set — the arrears reminder, a released meeting slot.
   * Capped because it is sent in the body and a whole-school list is what
   * `audience` is for.
   */
  studentIds: z.array(z.string().uuid()).max(1000).optional(),
  severity: z.enum(["INFO", "WARNING", "CRITICAL"]).optional(),
  expiresAt: z.string().datetime().nullish(),
  /**
   * The notice this one puts right. A notice cannot be recalled, so a follow-up
   * addressed to the same people is the only correction there is; recording the
   * pair is what stops the sent list reading as two unrelated letters.
   */
  correctsNoticeId: z.string().uuid().nullish(),
});

function parseAudience(type: string) {
  const upper = type.toUpperCase();
  if (upper.includes("PARENT")) return "Parents";
  if (upper.includes("STUDENT")) return "Students";
  if (upper.includes("TEACHER")) return "Teachers";
  return "All School Users";
}

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.reports", "view");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;

    /**
     * Two questions, one route. The default is "what have I been sent" — this
     * user's own inbox. `?scope=sent` is the office's question instead: what
     * has the school put out, and how far did it get. They are different rows
     * (recipients vs notifications) so they cannot be one query.
     */
    if (new URL(request.url).searchParams.get("scope") === "sent") {
      const notices = await listSentNotices({ companyId });
      return successResponse({ success: true, data: notices });
    }

    const now = new Date();
    const recipients = await prisma.notificationRecipient.findMany({
      where: {
        userId: session.user.id,
        isArchived: false,
        notification: {
          companyId,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
      },
      include: {
        notification: {
          select: {
            id: true,
            type: true,
            title: true,
            summary: true,
            severity: true,
            createdAt: true,
            expiresAt: true,
          },
        },
      },
      orderBy: [{ createdAt: "desc" }],
      take: 200,
    });

    const data = recipients.map((row) => ({
      id: row.notification.id,
      type: row.notification.type,
      title: row.notification.title,
      summary: row.notification.summary,
      severity: row.notification.severity,
      createdAt: row.notification.createdAt,
      expiresAt: row.notification.expiresAt,
      isRead: row.isRead,
      target: parseAudience(row.notification.type),
    }));

    return successResponse({
      success: true,
      data,
    });
  } catch (error) {
    console.error("[API] GET /api/v2/schools/notices error:", error);
    return errorResponse("Failed to fetch school notices");
  }
}

/**
 * Send a notice.
 *
 * Gated on `schools.reports` create, which of the school personas only the head
 * holds: a notice goes to every family at once and cannot be recalled, so it is
 * not a thing a clerk does by accident.
 */
export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.reports", "create");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;

    const validated = postSchema.parse(await request.json());

    if (validated.classId) {
      const schoolClass = await prisma.schoolClass.findFirst({
        where: { id: validated.classId, companyId },
        select: { id: true },
      });
      if (!schoolClass) return errorResponse("Class not found", 404);
    }

    if (validated.correctsNoticeId) {
      const original = await prisma.notification.findFirst({
        where: { id: validated.correctsNoticeId, companyId },
        select: { id: true },
      });
      if (!original) return errorResponse("The notice being corrected is not here", 404);
    }

    const result = await sendSchoolNotice({
      companyId,
      senderUserId: session.user.id,
      title: validated.title,
      body: validated.body,
      audience: validated.audience,
      classId: validated.classId ?? null,
      studentIds: validated.studentIds ?? null,
      severity: validated.severity ?? "INFO",
      expiresAt: validated.expiresAt ? new Date(validated.expiresAt) : null,
      correctsNoticeId: validated.correctsNoticeId ?? null,
    });

    return successResponse(result, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof NoticeError) return errorResponse(error.message, 409);
    console.error("[API] POST /api/v2/schools/notices error:", error);
    return errorResponse("Failed to send the notice");
  }
}
