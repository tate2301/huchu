import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { LeaverError, alumniRegister, alumniTallies } from "@/lib/schools/leavers";
import { schoolPermissionDenial } from "@/lib/schools/permissions";

/**
 * The alumni register.
 *
 * A row of its own rather than `SchoolStudent where status in (GRADUATED,
 * WITHDRAWN)`: everything the register is for — consent, a destination, an
 * address that is no longer the guardian's, a timeline — is a fact about
 * somebody who has left and has no column on a pupil. The link to the pupil is
 * kept and nullable, so a school can enter the class of 1994 without inventing
 * a student record for each of them.
 *
 * Contact consent has **three** states and the third is the one that matters. A
 * nullable boolean would collapse "they said no" and "nobody has asked" into
 * one answer, which is the mistake this screen is drawn to prevent.
 */

const listQuery = z.object({
  classOf: z.coerce.number().int().min(1900).max(2100).optional(),
  house: z.string().trim().max(80).optional(),
  destinationKind: z
    .enum([
      "UNKNOWN",
      "UNIVERSITY",
      "COLLEGE",
      "EMPLOYED",
      "SELF_EMPLOYED",
      "TRANSFERRED",
      "GAP_YEAR",
      "ABROAD",
      "OTHER",
    ])
    .optional(),
  consent: z.enum(["NOT_ASKED", "MAY_CONTACT", "NO_CONTACT"]).optional(),
  search: z.string().trim().max(120).optional(),
});

const createSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  classOf: z.coerce.number().int().min(1900).max(2100),
  finalClassName: z.string().trim().max(80).nullish(),
  house: z.string().trim().max(80).nullish(),
  email: z.string().trim().email().nullish(),
  phone: z.string().trim().max(40).nullish(),
  studentId: z.string().uuid().nullish(),
});

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.alumni", "view");
    if (denied) return errorResponse(denied, 403);

    const { searchParams } = new URL(request.url);
    const query = listQuery.parse(Object.fromEntries(searchParams.entries()));
    const companyId = session.user.companyId;

    const [rows, tallies, houses, years] = await Promise.all([
      alumniRegister({ companyId, ...query }),
      alumniTallies({ companyId }),
      prisma.schoolAlumnus.findMany({
        where: { companyId, house: { not: null } },
        select: { house: true },
        distinct: ["house"],
      }),
      prisma.schoolAlumnus.findMany({
        where: { companyId },
        select: { classOf: true },
        distinct: ["classOf"],
        orderBy: { classOf: "desc" },
      }),
    ]);

    return successResponse({
      rows,
      tallies,
      houses: houses.map((row) => row.house).filter((house): house is string => Boolean(house)),
      years: years.map((row) => row.classOf),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] GET /api/v2/schools/alumni error:", error);
    return errorResponse("Failed to read the alumni register");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.alumni", "create");
    if (denied) return errorResponse(denied, 403);

    const body = createSchema.parse(await request.json());
    const companyId = session.user.companyId;

    /*
      A `studentId` in a request body is a claim, not a fact.

      `SchoolAlumnus.studentId` is globally unique, so writing an unchecked one
      both links this school's alumnus to another school's pupil and burns that
      pupil's only alumnus slot — the other school can then never add them to
      its own register, and nothing on either side explains why.
    */
    if (body.studentId) {
      const pupil = await prisma.schoolStudent.findFirst({
        where: { id: body.studentId, companyId },
        select: { id: true },
      });
      if (!pupil) {
        return errorResponse("That pupil is not on this school's roll.", 404);
      }
    }

    const alumnus = await prisma.schoolAlumnus.create({
      data: {
        companyId,
        studentId: body.studentId ?? null,
        firstName: body.firstName,
        lastName: body.lastName,
        classOf: body.classOf,
        finalClassName: body.finalClassName ?? null,
        house: body.house ?? null,
        email: body.email ?? null,
        phone: body.phone ?? null,
      },
      select: { id: true },
    });
    return successResponse(alumnus, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof LeaverError) return errorResponse(error.message, 422);
    console.error("[API] POST /api/v2/schools/alumni error:", error);
    return errorResponse("Failed to add them to the register");
  }
}
