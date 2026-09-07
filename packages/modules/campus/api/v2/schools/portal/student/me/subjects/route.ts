import { NextRequest, NextResponse } from "next/server";
import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { getCurrentTerm } from "../../../../../../../calendar";
import { resolvePortalStudent } from "../../../../../../../portal-identity";

/**
 * The subjects this pupil is taught this term, with the mark they hold in each.
 *
 * `GET /api/v2/schools/goals` answers "what have you already aimed for", which
 * is a different question and cannot answer this one: a child who has never set
 * a goal gets an empty list back, and the goals screen would then have nothing
 * to offer a goal *on*. The subject list is the school's — it comes from the
 * class-subject rows the office assigns against the term — so it is read here
 * rather than guessed from whatever marks happen to exist.
 *
 * S-0.2: no `studentId` is accepted. The pupil is resolved from the signed-in
 * account through `resolvePortalStudent`, which is the only way any portal
 * route in this pack answers "who is this".
 *
 * `currentMark` is computed exactly as `goalsForStudent` computes it — result
 * lines for the term, matched on subject code. Two different answers to "where
 * are you now" on one screen would be a bug, so the two must be read the same
 * way even though it costs a second query.
 */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;

    const resolved = await resolvePortalStudent(
      { companyId, userId: session.user.id, role: session.user.role },
      { select: { id: true, currentClassId: true, currentStreamId: true } },
    );
    if (!resolved.subject) return errorResponse("You are not a student here", 403);
    const student = resolved.subject;

    const term = await getCurrentTerm(companyId);
    if (!term) return errorResponse("This school has no active term", 400);

    // Not in a year group is a real state, not an error: the pupil exists, the
    // office has not placed them yet, and the screen says so rather than 500ing.
    if (!student.currentClassId) {
      return successResponse({ termId: term.id, termName: term.name, subjects: [] });
    }

    const [taught, lines] = await Promise.all([
      prisma.schoolClassSubject.findMany({
        where: {
          companyId,
          termId: term.id,
          classId: student.currentClassId,
          isActive: true,
          // A subject is either taught to the whole year group (no stream) or to
          // this pupil's stream. Anyone else's stream is not theirs to see.
          ...(student.currentStreamId
            ? { OR: [{ streamId: null }, { streamId: student.currentStreamId }] }
            : { streamId: null }),
        },
        select: {
          subject: { select: { id: true, code: true, name: true } },
          teacherProfile: { select: { user: { select: { name: true } } } },
        },
        orderBy: { subject: { name: "asc" } },
      }),
      prisma.schoolResultLine.findMany({
        where: { companyId, studentId: student.id, sheet: { termId: term.id } },
        select: { subjectCode: true, score: true },
      }),
    ]);

    const markBySubjectCode = new Map(lines.map((line) => [line.subjectCode, line.score]));

    // A subject taught both class-wide and to the stream comes back twice. The
    // pupil sits in one of those lessons, so it is one row on their screen.
    const bySubjectId = new Map<
      string,
      { id: string; code: string; name: string; teacherName: string | null; currentMark: number | null }
    >();
    for (const row of taught) {
      if (bySubjectId.has(row.subject.id)) continue;
      bySubjectId.set(row.subject.id, {
        id: row.subject.id,
        code: row.subject.code,
        name: row.subject.name,
        teacherName: row.teacherProfile.user.name ?? null,
        currentMark: markBySubjectCode.get(row.subject.code) ?? null,
      });
    }

    return successResponse({
      termId: term.id,
      termName: term.name,
      subjects: Array.from(bySubjectId.values()),
    });
  } catch (error) {
    console.error("[API] GET /api/v2/schools/portal/student/me/subjects error:", error);
    return errorResponse("Failed to fetch your subjects");
  }
}
