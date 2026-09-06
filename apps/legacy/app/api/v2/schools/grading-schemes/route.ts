import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  errorResponse,
  successResponse,
  validateSession,
} from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { schoolPermissionDenial } from "@/lib/schools/permissions";
import { DEFAULT_GRADING_BANDS, findBandProblems } from "@/lib/schools/grading";

const bandSchema = z.object({
  grade: z.string().trim().min(1).max(10),
  minScore: z.number().min(0).max(100),
  maxScore: z.number().min(0).max(100),
  points: z.number().int().min(0).max(99).nullish(),
  remark: z.string().trim().max(120).nullish(),
});

const createSchema = z.object({
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(120),
  continuousWeight: z.number().min(0).max(100),
  examWeight: z.number().min(0).max(100),
  passMark: z.number().min(0).max(100).optional(),
  isDefault: z.boolean().optional(),
  /** Absent means the built-in A-to-U table. */
  bands: z.array(bandSchema).max(30).optional(),
});

const schemeSelect = {
  id: true,
  code: true,
  name: true,
  continuousWeight: true,
  examWeight: true,
  passMark: true,
  isDefault: true,
  isActive: true,
  bands: {
    select: {
      id: true,
      grade: true,
      minScore: true,
      maxScore: true,
      points: true,
      remark: true,
    },
    orderBy: { minScore: "desc" as const },
  },
};

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.academics", "view");
    if (denied) return errorResponse(denied, 403);

    const schemes = await prisma.schoolGradingScheme.findMany({
      where: { companyId: session.user.companyId },
      select: schemeSelect,
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    });

    return successResponse({ schemes, defaultBands: DEFAULT_GRADING_BANDS });
  } catch (error) {
    console.error("[API] GET /api/v2/schools/grading-schemes error:", error);
    return errorResponse("Failed to fetch grading schemes");
  }
}

/**
 * A new marking scheme and its grade table, written together.
 *
 * One transaction, because a scheme with no bands grades nothing and a school
 * that saved half of one would see every report card come back ungraded.
 *
 * Overlapping bands are refused here rather than by the database. Postgres can
 * express the rule with an `EXCLUDE USING gist` over `numrange`, but only with
 * the `btree_gist` extension, and requiring an extension at migration time
 * costs more on a failed deploy than this bug costs. This is the one route that
 * writes bands.
 */
export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.academics", "create");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;

    const validated = createSchema.parse(await request.json());

    if (validated.continuousWeight + validated.examWeight !== 100) {
      return errorResponse(
        `The two weights add to ${validated.continuousWeight + validated.examWeight}, not 100`,
        400,
      );
    }

    const bands = validated.bands ?? DEFAULT_GRADING_BANDS;
    const problems = findBandProblems(bands);
    // Gaps are reported as a warning by `findBandProblems`; overlaps and
    // backwards bands are the ones that make a report card wrong, so only those
    // stop the save.
    const fatal = problems.filter(
      (problem) =>
        problem.message.includes("both cover") ||
        problem.message.includes("down to") ||
        problem.message.includes("outside 0-100"),
    );
    if (fatal.length > 0) {
      return errorResponse(`Grade table: ${fatal[0].message}`, 400);
    }

    const created = await prisma.$transaction(async (tx) => {
      if (validated.isDefault) {
        // The partial unique index refuses a second default, so the previous
        // one stands down in the same transaction.
        await tx.schoolGradingScheme.updateMany({
          where: { companyId, isDefault: true },
          data: { isDefault: false },
        });
      }

      const scheme = await tx.schoolGradingScheme.create({
        data: {
          companyId,
          code: validated.code,
          name: validated.name,
          continuousWeight: validated.continuousWeight,
          examWeight: validated.examWeight,
          passMark: validated.passMark ?? 50,
          isDefault: validated.isDefault ?? false,
        },
        select: { id: true },
      });

      await tx.schoolGradingBand.createMany({
        data: bands.map((band) => ({
          companyId,
          schemeId: scheme.id,
          grade: band.grade,
          minScore: band.minScore,
          maxScore: band.maxScore,
          points: band.points ?? null,
          remark: band.remark ?? null,
        })),
      });

      return tx.schoolGradingScheme.findUniqueOrThrow({
        where: { id: scheme.id },
        select: schemeSelect,
      });
    });

    return successResponse(
      { scheme: created, warnings: problems.map((problem) => problem.message) },
      201,
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/v2/schools/grading-schemes error:", error);
    return errorResponse("Failed to create the grading scheme");
  }
}
