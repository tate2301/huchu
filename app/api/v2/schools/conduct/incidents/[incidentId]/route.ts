import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import {
  ConductError,
  conductParagraph,
  homeTold,
  updateIncident,
} from "@/lib/schools/conduct";
import { detentionStandingFor } from "@/lib/schools/detention";
import { pastoralNoteCountForStudent } from "@/lib/schools/pastoral-access";
import { schoolPermissionDenial } from "@/lib/schools/permissions";

/**
 * One incident, end to end.
 *
 * Everything the record page draws comes from here in one read: the properties,
 * the accounts, the review spine's five steps, the pupil's term, the detention
 * standing behind the `Served` and `Next detention` chips, and the pastoral
 * **count**.
 *
 * The pastoral number is a count and nothing else. The alert says a note exists
 * and shows no author, no date, no band and no body — and it must render
 * identically for a reader who is cleared for the note and one who is not, or
 * the presence of detail on a discipline page becomes a side channel into the
 * pastoral record.
 */

const patchSchema = z.object({
  summary: z.string().trim().min(1).max(500).optional(),
  categoryId: z.string().uuid().optional(),
  occurredAt: z.string().datetime().optional(),
  location: z.string().trim().max(200).nullish(),
  period: z.coerce.number().int().min(1).max(20).nullish(),
  sanction: z.string().trim().max(200).nullish(),
  sanctionTone: z.enum(["PLAIN", "WARN", "BAD"]).optional(),
});

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ incidentId: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.conduct", "view");
    if (denied) return errorResponse(denied, 403);

    const { incidentId } = await context.params;
    const companyId = session.user.companyId;

    const incident = await prisma.schoolConductIncident.findFirst({
      where: { id: incidentId, companyId },
      select: {
        id: true,
        reference: true,
        occurredAt: true,
        summary: true,
        location: true,
        period: true,
        sanction: true,
        sanctionTone: true,
        sanctionDecidedAt: true,
        sanctionDecidedByUserId: true,
        homeToldAt: true,
        homeToldChannel: true,
        homeToldNeeded: true,
        homeToldByUserId: true,
        reportedAt: true,
        reportedByUserId: true,
        seenAt: true,
        seenByUserId: true,
        termId: true,
        category: { select: { id: true, name: true, tone: true } },
        student: {
          select: {
            id: true,
            studentNo: true,
            firstName: true,
            lastName: true,
            currentClass: { select: { id: true, name: true } },
            currentStream: { select: { id: true, name: true } },
          },
        },
        participants: {
          select: {
            id: true,
            sanction: true,
            student: {
              select: { id: true, studentNo: true, firstName: true, lastName: true },
            },
          },
        },
        accounts: {
          select: {
            id: true,
            authorKind: true,
            authorUserId: true,
            takenAt: true,
            body: true,
            authorStudent: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                currentClass: { select: { name: true } },
                currentStream: { select: { name: true } },
              },
            },
          },
          orderBy: { takenAt: "asc" },
        },
      },
    });
    if (!incident) return errorResponse("That incident is not on this school's log.", 404);

    const [thisTerm, merits, detention, pastoralCount, reportCard, staff] = await Promise.all([
      prisma.schoolConductIncident.findMany({
        where: {
          companyId,
          studentId: incident.student.id,
          termId: incident.termId,
        },
        select: {
          id: true,
          occurredAt: true,
          summary: true,
          sanction: true,
          sanctionTone: true,
          category: { select: { name: true } },
        },
        orderBy: { occurredAt: "desc" },
      }),
      prisma.schoolMeritEntry.count({
        where: {
          companyId,
          studentId: incident.student.id,
          termId: incident.termId,
          kind: "MERIT",
          reversedAt: null,
        },
      }),
      detentionStandingFor({ companyId, studentId: incident.student.id }),
      pastoralNoteCountForStudent({ companyId, studentId: incident.student.id }),
      conductParagraph({
        companyId,
        studentId: incident.student.id,
        termId: incident.termId,
      }),
      // Every user id on the page, resolved once.
      prisma.user.findMany({
        where: {
          id: {
            in: [
              incident.reportedByUserId,
              incident.seenByUserId,
              incident.sanctionDecidedByUserId,
              incident.homeToldByUserId,
              ...incident.accounts.map((account) => account.authorUserId),
            ].filter((id): id is string => Boolean(id)),
          },
        },
        select: { id: true, name: true, email: true, role: true },
      }),
    ]);

    const staffById = Object.fromEntries(
      staff.map((user) => [user.id, { name: user.name ?? user.email, role: user.role }]),
    );

    return successResponse({
      incident,
      homeTold: homeTold(incident),
      thisTerm,
      merits,
      detention,
      // An integer. Nothing about the note, by design.
      pastoralNoteCount: pastoralCount,
      reportCard,
      staffById,
    });
  } catch (error) {
    console.error("[API] GET /api/v2/schools/conduct/incidents/[id] error:", error);
    return errorResponse("Failed to read the incident");
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ incidentId: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.conduct", "edit");
    if (denied) return errorResponse(denied, 403);

    const { incidentId } = await context.params;
    const body = patchSchema.parse(await request.json());

    const updated = await updateIncident({
      companyId: session.user.companyId,
      actorId: session.user.id,
      incidentId,
      data: {
        ...body,
        occurredAt: body.occurredAt ? new Date(body.occurredAt) : undefined,
        location: body.location ?? undefined,
        period: body.period ?? undefined,
        sanction: body.sanction ?? undefined,
      },
    });
    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof ConductError) return errorResponse(error.message, 422);
    console.error("[API] PATCH /api/v2/schools/conduct/incidents/[id] error:", error);
    return errorResponse("Failed to update the incident");
  }
}
