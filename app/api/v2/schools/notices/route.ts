import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { schoolPermissionDenial } from "@/lib/schools/permissions";
import {
  listSentNotices,
  NoticeError,
  noticePayloadWithEdit,
  SCHOOL_NOTICE_TYPES,
  sendSchoolNotice,
} from "@/lib/schools/notices";

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
 * Gated on `schools.reports` notify-families. A notice cannot be recalled — the
 * only correction is a second letter to the same people — so it is held behind
 * a grant of its own rather than behind whoever happens to be signed in. The
 * grant is not the head's alone: the bursar who chases arrears and the class
 * teacher who tells a family about an absence both write to families as part of
 * the job, and gating this on `create` left them with a button that answered
 * 403.
 */
export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.reports", "notify-families");
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

/**
 * Put right what a notice says.
 *
 * Until now a notice was fixed the moment it was written. A school that sent
 * "Sports day moved to Firday" to eleven hundred families had that spelling in
 * the portal for the rest of the year, and the only remedy the product offered
 * was a second letter about a typo — which is a heavier thing to ask of every
 * family than the mistake was.
 *
 * Be clear about what this does, because it is less than the word "edit"
 * usually promises. Nothing in this product delivers a notice; it is a row the
 * portals read. So changing the wording changes what a family sees the *next*
 * time they open the app, and tells nobody: whoever already read it keeps the
 * version they read, and no one gets a second ping saying it moved. That makes
 * this the right verb for a typo, a wrong room number, a name spelled wrong —
 * and the wrong one for anything that changes what a family has to do, where
 * the honest answer is still a correction notice addressed to the same people.
 * The screen says so at the point of editing.
 *
 * Three fields, and the boundary is deliberate. The audience and the year group
 * are not editable: the recipient rows were written when the notice was sent
 * and cannot be rewritten, so a notice retyped as "Teachers" would sit in four
 * hundred parents' portals describing itself as something they never got.
 * Title, body and importance change what the same people read; the address does
 * not change who they are.
 */
const patchSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(160).optional(),
  body: z.string().trim().min(1).max(4000).optional(),
  severity: z.enum(["INFO", "WARNING", "CRITICAL"]).optional(),
});

export async function PATCH(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    // The same grant as sending. Rewording a letter that has gone out is the
    // same authority as writing it, held by the same office, bursar and class
    // teacher — there is no lesser version of speaking to families.
    const denied = schoolPermissionDenial(session, "schools.reports", "notify-families");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;

    const validated = patchSchema.parse(await request.json());

    // An empty patch would otherwise stamp an untouched notice as edited, which
    // is the one thing the stamp is supposed to mean.
    if (
      validated.title === undefined &&
      validated.body === undefined &&
      validated.severity === undefined
    ) {
      return errorResponse("There is nothing in that to change.", 400);
    }

    /**
     * The id is a claim until it is resolved — against this company, and
     * against the four school notice types besides. `Notification` is the whole
     * tenant's table: payroll runs, permit expiries and lead alerts are rows in
     * it too, and a company-only check would let the Notices screen rewrite the
     * text of a payroll alert.
     */
    const existing = await prisma.notification.findFirst({
      where: { id: validated.id, companyId, type: { in: [...SCHOOL_NOTICE_TYPES] } },
      select: { id: true, payloadJson: true },
    });
    if (!existing) return errorResponse("That notice is not this school's.", 404);

    const updated = await prisma.notification.update({
      where: { id: existing.id },
      data: {
        ...(validated.title !== undefined ? { title: validated.title } : {}),
        // The message is `summary` in the table — the notice board renders it
        // as the letter, and always has.
        ...(validated.body !== undefined ? { summary: validated.body } : {}),
        ...(validated.severity !== undefined ? { severity: validated.severity } : {}),
        // Merged, never replaced: the payload is the only record of the pupils
        // a shortlisted notice was aimed at and how many families had no
        // account to receive it.
        payloadJson: noticePayloadWithEdit(existing.payloadJson, session.user.id),
      },
      select: { id: true, title: true, summary: true, severity: true },
    });

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] PATCH /api/v2/schools/notices error:", error);
    return errorResponse("Failed to change the notice");
  }
}
