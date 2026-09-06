import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  errorResponse,
  isValidUUID,
  successResponse,
  validateSession,
} from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { findBandProblems } from "@/lib/schools/grading";
import { schoolPermissionDenial } from "@/lib/schools/permissions";
import { isUniqueConstraintError } from "../../_helpers";

/**
 * One marking scheme, revised or retired.
 *
 * The list route could create a scheme and nothing could change one, so a
 * school that mistyped a weight had to make a second scheme and remember which
 * of the two was the real one. Bands are rewritten wholesale when they are
 * given, for the same reason the sibling route writes them in a transaction: a
 * grade table half-replaced grades nothing, and every report card built from it
 * comes back ungraded.
 */

const bandSchema = z.object({
  grade: z.string().trim().min(1).max(10),
  minScore: z.number().min(0).max(100),
  maxScore: z.number().min(0).max(100),
  points: z.number().int().min(0).max(99).nullish(),
  remark: z.string().trim().max(120).nullish(),
});

const updateSchema = z
  .object({
    code: z.string().trim().min(1).max(40).optional(),
    name: z.string().trim().min(1).max(120).optional(),
    continuousWeight: z.number().min(0).max(100).optional(),
    examWeight: z.number().min(0).max(100).optional(),
    passMark: z.number().min(0).max(100).optional(),
    isDefault: z.boolean().optional(),
    isActive: z.boolean().optional(),
    /** Absent leaves the grade table alone; given, it replaces it. */
    bands: z.array(bandSchema).max(30).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.academics", "view");
    if (denied) return errorResponse(denied, 403);

    const { id } = await params;
    if (!isValidUUID(id)) return errorResponse("Invalid scheme ID", 400);

    const scheme = await prisma.schoolGradingScheme.findFirst({
      where: { id, companyId: session.user.companyId },
      select: schemeSelect,
    });
    if (!scheme) return errorResponse("Grading scheme not found", 404);

    return successResponse(scheme);
  } catch (error) {
    console.error("[API] GET /api/v2/schools/grading-schemes/[id] error:", error);
    return errorResponse("Failed to fetch the grading scheme");
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.academics", "edit");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;

    const { id } = await params;
    if (!isValidUUID(id)) return errorResponse("Invalid scheme ID", 400);

    const existing = await prisma.schoolGradingScheme.findFirst({
      where: { id, companyId },
      select: { id: true, continuousWeight: true, examWeight: true, isDefault: true },
    });
    if (!existing) return errorResponse("Grading scheme not found", 404);

    const validated = updateSchema.parse(await request.json());

    const continuousWeight =
      validated.continuousWeight ?? Number(existing.continuousWeight);
    const examWeight = validated.examWeight ?? Number(existing.examWeight);
    if (continuousWeight + examWeight !== 100) {
      return errorResponse(
        `The two weights add to ${continuousWeight + examWeight}, not 100`,
        400,
      );
    }

    let warnings: string[] = [];
    if (validated.bands) {
      const problems = findBandProblems(validated.bands);
      // Same split as the create route: a gap is a warning because a table
      // being typed in has them; an overlap or a backwards band makes a report
      // card disagree with itself, so it stops the save.
      const fatal = problems.filter(
        (problem) =>
          problem.message.includes("both cover") ||
          problem.message.includes("down to") ||
          problem.message.includes("outside 0-100"),
      );
      if (fatal.length > 0) {
        return errorResponse(`Grade table: ${fatal[0].message}`, 400);
      }
      warnings = problems.map((problem) => problem.message);
    }

    // The school's default scheme is the one every unassigned mark sheet
    // grades against, so it may never be turned off without another taking
    // over — that would leave the school with no answer at all.
    if (validated.isDefault === false && existing.isDefault) {
      return errorResponse(
        "Make another scheme the default instead. A school always has one.",
        409,
      );
    }
    if (validated.isActive === false && existing.isDefault) {
      return errorResponse(
        "This is the default scheme. Make another one the default before retiring it.",
        409,
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (validated.isDefault) {
        // The partial unique index refuses a second default, so the previous
        // one stands down in the same transaction.
        await tx.schoolGradingScheme.updateMany({
          where: { companyId, isDefault: true, NOT: { id: existing.id } },
          data: { isDefault: false },
        });
      }

      await tx.schoolGradingScheme.update({
        where: { id: existing.id },
        data: {
          ...(validated.code !== undefined ? { code: validated.code } : {}),
          ...(validated.name !== undefined ? { name: validated.name } : {}),
          ...(validated.continuousWeight !== undefined
            ? { continuousWeight: validated.continuousWeight }
            : {}),
          ...(validated.examWeight !== undefined
            ? { examWeight: validated.examWeight }
            : {}),
          ...(validated.passMark !== undefined ? { passMark: validated.passMark } : {}),
          ...(validated.isDefault !== undefined
            ? { isDefault: validated.isDefault }
            : {}),
          ...(validated.isActive !== undefined ? { isActive: validated.isActive } : {}),
        },
      });

      if (validated.bands) {
        await tx.schoolGradingBand.deleteMany({
          where: { companyId, schemeId: existing.id },
        });
        await tx.schoolGradingBand.createMany({
          data: validated.bands.map((band) => ({
            companyId,
            schemeId: existing.id,
            grade: band.grade,
            minScore: band.minScore,
            maxScore: band.maxScore,
            points: band.points ?? null,
            remark: band.remark ?? null,
          })),
        });
      }

      return tx.schoolGradingScheme.findUniqueOrThrow({
        where: { id: existing.id },
        select: schemeSelect,
      });
    });

    return successResponse({ scheme: updated, warnings });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (isUniqueConstraintError(error)) {
      return errorResponse("A grading scheme with this code already exists", 409);
    }
    console.error("[API] PATCH /api/v2/schools/grading-schemes/[id] error:", error);
    return errorResponse("Failed to update the grading scheme");
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.academics", "archive");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;

    const { id } = await params;
    if (!isValidUUID(id)) return errorResponse("Invalid scheme ID", 400);

    const existing = await prisma.schoolGradingScheme.findFirst({
      where: { id, companyId },
      select: { id: true, isDefault: true },
    });
    if (!existing) return errorResponse("Grading scheme not found", 404);

    if (existing.isDefault) {
      return errorResponse(
        "This is the default scheme. Make another one the default before deleting it.",
        409,
      );
    }

    // The bands cascade with the scheme, which is right — a band means nothing
    // outside the table it belongs to.
    await prisma.schoolGradingScheme.delete({ where: { id: existing.id } });
    return successResponse({ id: existing.id, deleted: true });
  } catch (error) {
    console.error("[API] DELETE /api/v2/schools/grading-schemes/[id] error:", error);
    return errorResponse("Failed to delete the grading scheme");
  }
}
