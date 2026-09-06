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
import {
  activateAcademicYear,
  findOverlappingAcademicYear,
  isDateRangeValid,
} from "@/lib/schools/calendar";
import { dateInputSchema, isUniqueConstraintError } from "../_helpers";

const querySchema = z.object({
  search: z.string().trim().min(1).optional(),
  isActive: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});

const createSchema = z.object({
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(120),
  startDate: dateInputSchema,
  endDate: dateInputSchema,
  isActive: z.boolean().optional(),
});

const academicYearInclude = {
  terms: {
    select: {
      id: true,
      code: true,
      name: true,
      startDate: true,
      endDate: true,
      isActive: true,
    },
    orderBy: { startDate: "asc" as const },
  },
  _count: { select: { terms: true, classes: true } },
};

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.academics", "view");
    if (denied) return errorResponse(denied, 403);
    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = getPaginationParams(request);

    const query = querySchema.parse({
      search: searchParams.get("search") ?? undefined,
      isActive: searchParams.get("isActive") ?? undefined,
    });

    const where = {
      companyId: session.user.companyId,
      ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
      ...(query.search
        ? {
            OR: [
              { code: { contains: query.search, mode: "insensitive" as const } },
              { name: { contains: query.search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [records, total] = await Promise.all([
      prisma.schoolAcademicYear.findMany({
        where,
        include: academicYearInclude,
        orderBy: [{ startDate: "desc" }],
        skip,
        take: limit,
      }),
      prisma.schoolAcademicYear.count({ where }),
    ]);

    return successResponse(paginationResponse(records, total, page, limit));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] GET /api/v2/schools/academic-years error:", error);
    return errorResponse("Failed to fetch academic years");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.academics", "create");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;

    const validated = createSchema.parse(await request.json());
    const startDate = new Date(validated.startDate);
    const endDate = new Date(validated.endDate);

    if (!isDateRangeValid(startDate, endDate)) {
      return errorResponse("The year must end after it starts", 400);
    }

    const overlapping = await findOverlappingAcademicYear({
      companyId,
      startDate,
      endDate,
    });
    if (overlapping) {
      return errorResponse(
        `These dates overlap ${overlapping.code} - ${overlapping.name}. Academic years cannot overlap.`,
        409,
      );
    }

    const created = await prisma.schoolAcademicYear.create({
      data: {
        companyId,
        code: validated.code,
        name: validated.name,
        startDate,
        endDate,
        isActive: false,
      },
      include: academicYearInclude,
    });

    // Activation stands the previous year down in the same transaction; the
    // partial unique index would reject two active rows.
    if (validated.isActive) {
      await activateAcademicYear({ companyId, academicYearId: created.id });
      const activated = await prisma.schoolAcademicYear.findUnique({
        where: { id: created.id },
        include: academicYearInclude,
      });
      return successResponse(activated, 201);
    }

    return successResponse(created, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (isUniqueConstraintError(error)) {
      return errorResponse("An academic year with this code already exists", 409);
    }
    console.error("[API] POST /api/v2/schools/academic-years error:", error);
    return errorResponse("Failed to create academic year");
  }
}
