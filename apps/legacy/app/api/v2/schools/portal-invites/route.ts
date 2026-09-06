import { Prisma } from "@corelithzw/db";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  errorResponse,
  getPaginationParams,
  paginationResponse,
  successResponse,
  validateSession,
} from "@/lib/api-utils";
import { prisma } from "@corelithzw/db/client";
import { schoolPermissionDenial } from "@/lib/schools/permissions";
import { canViewAnyPortalSubject } from "@/lib/schools/portal-identity";
import { InviteError, issuePortalInvite } from "@/lib/schools/portal-invites";

const subjectSchema = z.enum(["STUDENT", "GUARDIAN"]);

const querySchema = z.object({
  subject: subjectSchema.optional(),
  /**
   * One record's invitations. A record page asks "has this parent been
   * invited, and is the invitation still live" — without it the page had to
   * pull every outstanding invite in the school and find its own row.
   */
  subjectId: z.string().uuid().optional(),
  status: z.enum(["outstanding", "claimed", "revoked"]).optional(),
});

/**
 * Issue one invite or a batch of them.
 *
 * A school opening the portal for the first time invites hundreds of guardians
 * at once, so the batch form is the primary one and the single invite is a
 * batch of one. Each entry succeeds or fails on its own — one bad address must
 * not cost the other 799 their invitation.
 */
const createSchema = z.object({
  invites: z
    .array(
      z.object({
        subject: subjectSchema,
        subjectId: z.string().uuid(),
        sentTo: z.string().trim().email(),
      }),
    )
    .min(1)
    .max(500),
});

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.students", "view");
    if (denied) return errorResponse(denied, 403);

    if (!canViewAnyPortalSubject(session.user.role)) {
      return errorResponse("Portal invitations are managed by school staff", 403);
    }

    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = getPaginationParams(request);
    const query = querySchema.parse({
      subject: searchParams.get("subject") ?? undefined,
      subjectId: searchParams.get("subjectId") ?? undefined,
      status: searchParams.get("status") ?? undefined,
    });

    // The subject is a nullable key per kind, so which column an id belongs in
    // depends on `subject`; asked for without one it matches either.
    const subjectWhere: Prisma.SchoolPortalInviteWhereInput = !query.subjectId
      ? {}
      : query.subject === "STUDENT"
        ? { studentId: query.subjectId }
        : query.subject === "GUARDIAN"
          ? { guardianId: query.subjectId }
          : { OR: [{ studentId: query.subjectId }, { guardianId: query.subjectId }] };

    const where = {
      companyId: session.user.companyId,
      ...(query.subject ? { subject: query.subject } : {}),
      ...subjectWhere,
      ...(query.status === "outstanding"
        ? { claimedAt: null, revokedAt: null }
        : query.status === "claimed"
          ? { claimedAt: { not: null } }
          : query.status === "revoked"
            ? { revokedAt: { not: null } }
            : {}),
    };

    const [records, total] = await Promise.all([
      prisma.schoolPortalInvite.findMany({
        where,
        // tokenHash is deliberately absent: nothing outside the claim path
        // should be able to read it, including staff.
        select: {
          id: true,
          subject: true,
          sentTo: true,
          expiresAt: true,
          claimedAt: true,
          revokedAt: true,
          createdAt: true,
          student: { select: { id: true, studentNo: true, firstName: true, lastName: true } },
          guardian: {
            select: { id: true, guardianNo: true, firstName: true, lastName: true },
          },
        },
        orderBy: [{ createdAt: "desc" }],
        skip,
        take: limit,
      }),
      prisma.schoolPortalInvite.count({ where }),
    ]);

    return successResponse(paginationResponse(records, total, page, limit));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] GET /api/v2/schools/portal-invites error:", error);
    return errorResponse("Failed to fetch portal invitations");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.students", "create");
    if (denied) return errorResponse(denied, 403);

    if (!canViewAnyPortalSubject(session.user.role)) {
      return errorResponse("Portal invitations are issued by school staff", 403);
    }

    const validated = createSchema.parse(await request.json());
    const companyId = session.user.companyId;

    const issued: Array<{
      subjectId: string;
      subject: string;
      sentTo: string;
      token: string;
      expiresAt: Date;
    }> = [];
    const failed: Array<{ subjectId: string; sentTo: string; reason: string }> = [];

    for (const entry of validated.invites) {
      try {
        const invite = await issuePortalInvite({
          companyId,
          subject: entry.subject,
          subjectId: entry.subjectId,
          sentTo: entry.sentTo,
          createdById: session.user.id,
        });
        issued.push({
          subjectId: invite.subjectId,
          subject: invite.subject,
          sentTo: invite.sentTo,
          token: invite.token,
          expiresAt: invite.expiresAt,
        });
      } catch (error) {
        failed.push({
          subjectId: entry.subjectId,
          sentTo: entry.sentTo,
          reason:
            error instanceof InviteError
              ? error.message
              : "Could not issue this invitation",
        });
      }
    }

    // Tokens appear here and nowhere else. Whoever issued the batch is
    // responsible for delivering them; only the hash survives the response.
    return successResponse({ issued, failed }, issued.length > 0 ? 201 : 400);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/v2/schools/portal-invites error:", error);
    return errorResponse("Failed to issue portal invitations");
  }
}
