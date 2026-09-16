import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { examReferenceData } from "@/lib/schools/exams";
import { schoolPermissionDenial } from "@/lib/schools/permissions";

/**
 * The boards a school enters with, its centre numbers, and the board codes for
 * its subjects.
 *
 * Three tables rather than columns on `SchoolSubject`, because a centre number
 * belongs to a board and one school subject carries a different syllabus code
 * with each board it is entered under — ZIMSEC Mathematics is `4008` and the
 * Cambridge equivalent is not.
 */

const createSchema = z.union([
  z.object({
    kind: z.literal("board"),
    code: z.string().trim().min(1).max(40),
    name: z.string().trim().min(1).max(120),
  }),
  z.object({
    kind: z.literal("centre"),
    boardId: z.string().uuid(),
    number: z.string().trim().min(1).max(40),
    name: z.string().trim().max(160).nullish(),
  }),
  z.object({
    kind: z.literal("subject"),
    boardId: z.string().uuid(),
    subjectId: z.string().uuid().nullish(),
    code: z.string().trim().min(1).max(20),
    name: z.string().trim().min(1).max(120),
    level: z.enum(["O_LEVEL", "A_LEVEL", "IGCSE"]),
  }),
]);

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.exams", "view");
    if (denied) return errorResponse(denied, 403);

    const reference = await examReferenceData(session.user.companyId);
    return successResponse(reference);
  } catch (error) {
    console.error("[API] GET /api/v2/schools/exams/reference error:", error);
    return errorResponse("Failed to read the exam set-up");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.exams", "configure");
    if (denied) return errorResponse(denied, 403);

    const body = createSchema.parse(await request.json());
    const companyId = session.user.companyId;

    /*
      A `boardId` or `subjectId` in a request body is a claim.

      Both are written straight into a row stamped with THIS company's
      `companyId`, so an unchecked one hangs this school's centre number or
      syllabus off another school's board — a row the victim school can see on
      its own reference screen and cannot explain, and one that makes its board
      list disagree with its own series.
    */
    if (body.kind !== "board") {
      const board = await prisma.schoolExamBoard.findFirst({
        where: { id: body.boardId, companyId },
        select: { id: true },
      });
      if (!board) return errorResponse("That exam board is not this school's.", 404);
    }
    if (body.kind === "subject" && body.subjectId) {
      const subject = await prisma.schoolSubject.findFirst({
        where: { id: body.subjectId, companyId },
        select: { id: true },
      });
      if (!subject) return errorResponse("That subject is not this school's.", 404);
    }

    if (body.kind === "board") {
      const board = await prisma.schoolExamBoard.create({
        data: { companyId, code: body.code, name: body.name },
        select: { id: true, code: true, name: true },
      });
      return successResponse(board, 201);
    }
    if (body.kind === "centre") {
      const centre = await prisma.schoolExamCentre.create({
        data: {
          companyId,
          boardId: body.boardId,
          number: body.number,
          name: body.name ?? null,
        },
        select: { id: true, number: true },
      });
      return successResponse(centre, 201);
    }
    const subject = await prisma.schoolExamSubject.create({
      data: {
        companyId,
        boardId: body.boardId,
        subjectId: body.subjectId ?? null,
        code: body.code,
        name: body.name,
        level: body.level,
      },
      select: { id: true, code: true, name: true },
    });
    return successResponse(subject, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    // A school typing its syllabus list in will reach for a code it already
    // used. `@@unique([companyId, boardId, code, level])` and its siblings are
    // right to refuse it; a raw 500 is not the way to say so.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return errorResponse("Something with that code already exists for this school.", 409);
    }
    console.error("[API] POST /api/v2/schools/exams/reference error:", error);
    return errorResponse("Failed to add it");
  }
}
