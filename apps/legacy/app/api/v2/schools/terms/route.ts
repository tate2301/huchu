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
  activateTerm,
  findOverlappingTerm,
  isDateRangeValid,
} from "@/lib/schools/calendar";
import { dateInputSchema, isUniqueConstraintError } from "../_helpers";

const querySchema = z.object({
  search: z.string().trim().min(1).optional(),
  academicYearId: z.string().uuid().optional(),
  isActive: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});

const createSchema = z.object({
  academicYearId: z.string().uuid(),
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(120),
  startDate: dateInputSchema,
  endDate: dateInputSchema,
  isActive: z.boolean().optional(),
});

const termInclude = {
  academicYear: {
    select: { id: true, code: true, name: true, isActive: true },
  },
  _count: {
    select: {
      enrollments: true,
      feeInvoices: true,
      resultSheets: true,
      classSubjects: true,
    },
  },
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
      academicYearId: searchParams.get("academicYearId") ?? undefined,
      isActive: searchParams.get("isActive") ?? undefined,
    });

    const where = {
      companyId: session.user.companyId,
      ...(query.academicYearId ? { academicYearId: query.academicYearId } : {}),
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
      prisma.schoolTerm.findMany({
        where,
        include: termInclude,
        orderBy: [{ startDate: "desc" }],
        skip,
        take: limit,
      }),
      prisma.schoolTerm.count({ where }),
    ]);

    return successResponse(paginationResponse(records, total, page, limit));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] GET /api/v2/schools/terms error:", error);
    return errorResponse("Failed to fetch terms");
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
      return errorResponse("The term must end after it starts", 400);
    }

    const academicYear = await prisma.schoolAcademicYear.findFirst({
      where: { id: validated.academicYearId, companyId },
      select: { id: true, code: true, name: true, startDate: true, endDate: true },
    });
    if (!academicYear) {
      return errorResponse("Invalid academic year for this company", 400);
    }

    // A term outside its year would make date-to-term resolution ambiguous for
    // registers and invoices, so reject rather than silently widen the year.
    if (startDate < academicYear.startDate || endDate > academicYear.endDate) {
      return errorResponse(
        `The term must fall inside ${academicYear.code} - ${academicYear.name}`,
        400,
      );
    }

    const overlapping = await findOverlappingTerm({
      companyId,
      academicYearId: validated.academicYearId,
      startDate,
      endDate,
    });
    if (overlapping) {
      return errorResponse(
        `These dates overlap ${overlapping.code} - ${overlapping.name}. Terms in one year cannot overlap.`,
        409,
      );
    }

    const created = await prisma.schoolTerm.create({
      data: {
        companyId,
        academicYearId: validated.academicYearId,
        code: validated.code,
        name: validated.name,
        startDate,
        endDate,
        isActive: false,
      },
      include: termInclude,
    });

    if (validated.isActive) {
      await activateTerm({ companyId, termId: created.id });
      const activated = await prisma.schoolTerm.findUnique({
        where: { id: created.id },
        include: termInclude,
      });
      return successResponse(activated, 201);
    }

    return successResponse(created, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (isUniqueConstraintError(error)) {
      return errorResponse(
        "A term with this code already exists in this academic year",
        409,
      );
    }
    console.error("[API] POST /api/v2/schools/terms error:", error);
    return errorResponse("Failed to create term");
  }
}
