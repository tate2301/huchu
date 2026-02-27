import { NextRequest, NextResponse } from "next/server";
import {
  validateSession,
  errorResponse,
  hasRole,
  successResponse,
  getPaginationParams,
  paginationResponse,
} from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { WorkType } from "@prisma/client";

function normalizeShiftLabel(value: string) {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

const shiftLabelSchema = z
  .string()
  .trim()
  .min(1, "Shift is required")
  .max(50, "Shift must be 50 characters or less")
  .transform(normalizeShiftLabel);

// Validation schema
const shiftReportSchema = z
  .object({
    date: z
      .string()
      .datetime()
      .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
    shift: shiftLabelSchema,
    siteId: z.string().uuid(),
    shiftGroupId: z.string().uuid().optional(),
    groupLeaderId: z.string().uuid().optional(),
    crewCount: z.number().int().min(0).max(1000),
    workType: z.nativeEnum(WorkType),
    outputTonnes: z.number().min(0).optional(),
    outputTrips: z.number().int().min(0).optional(),
    outputWheelbarrows: z.number().int().min(0).optional(),
    metresAdvanced: z.number().min(0).optional(),
    hasIncident: z.boolean().optional(),
    incidentNotes: z.string().max(1000).optional(),
    handoverNotes: z.string().max(2000).optional(),
  })
  .refine((data) => Boolean(data.groupLeaderId || data.shiftGroupId), {
    message: "Group leader or shift group is required",
    path: ["groupLeaderId"],
  })
  .refine((data) => !data.hasIncident || !!data.incidentNotes, {
    message: "Incident notes are required when an incident is reported",
    path: ["incidentNotes"],
  });

// GET - List shift reports with filters
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get("siteId");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const shiftGroupId = searchParams.get("shiftGroupId");
    const status = searchParams.get("status");
    const search = searchParams.get("search")?.trim();
    const { page, limit, skip } = getPaginationParams(request);

    const where: Record<string, unknown> = {
      site: {
        companyId: session.user.companyId,
      },
    };

    if (siteId) where.siteId = siteId;
    if (shiftGroupId) where.shiftGroupId = shiftGroupId;
    if (startDate) {
      const dateWhere = (where.date as Record<string, Date> | undefined) ?? {};
      where.date = { ...dateWhere, gte: new Date(startDate) };
    }
    if (endDate) {
      const dateWhere = (where.date as Record<string, Date> | undefined) ?? {};
      where.date = { ...dateWhere, lte: new Date(endDate) };
    }
    if (status) where.status = status;
    if (search) {
      const normalizedSearch = search.toUpperCase();
      const statusMatches = ["DRAFT", "SUBMITTED", "VERIFIED", "APPROVED", "REJECTED"].includes(
        normalizedSearch,
      );
      const workTypeMatches = (Object.values(WorkType) as string[]).includes(normalizedSearch);

      where.OR = [
        { handoverNotes: { contains: search, mode: "insensitive" } },
        { incidentNotes: { contains: search, mode: "insensitive" } },
        { shift: { contains: search, mode: "insensitive" } },
        { site: { name: { contains: search, mode: "insensitive" } } },
        { site: { code: { contains: search, mode: "insensitive" } } },
        { shiftGroup: { name: { contains: search, mode: "insensitive" } } },
        { groupLeader: { name: { contains: search, mode: "insensitive" } } },
        ...(statusMatches ? [{ status: normalizedSearch }] : []),
        ...(workTypeMatches ? [{ workType: normalizedSearch as WorkType }] : []),
      ];
    }

    const [reports, total] = await Promise.all([
      prisma.shiftReport.findMany({
        where,
        include: {
          site: { select: { name: true, code: true } },
          shiftGroup: { select: { id: true, name: true, code: true } },
          groupLeader: { select: { name: true } },
          downtimeEvents: {
            include: {
              downtimeCode: { select: { description: true, code: true } },
            },
          },
        },
        orderBy: { date: "desc" },
        skip,
        take: limit,
      }),
      prisma.shiftReport.count({ where }),
    ]);

    return successResponse(paginationResponse(reports, total, page, limit));
  } catch (error) {
    console.error("[API] GET /api/shift-reports error:", error);
    return errorResponse("Failed to fetch shift reports");
  }
}

// POST - Create new shift report
export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    if (!hasRole(session, ["SUPERADMIN"])) {
      return errorResponse("Only SUPERADMIN can create shift reports.", 403);
    }

    const body = await request.json();
    const normalizedWorkType =
      typeof body.workType === "string"
        ? body.workType.trim().toUpperCase()
        : body.workType;
    const normalizedBody = {
      ...body,
      workType:
        normalizedWorkType === "HAULAGE" ? "HAULING" : normalizedWorkType,
    };
    const validated = shiftReportSchema.parse(normalizedBody);

    const [site, shiftGroup] = await Promise.all([
      prisma.site.findUnique({
        where: { id: validated.siteId },
        select: { companyId: true, isActive: true },
      }),
      validated.shiftGroupId
        ? prisma.shiftGroup.findUnique({
            where: { id: validated.shiftGroupId },
            select: {
              id: true,
              companyId: true,
              siteId: true,
              isActive: true,
              leaderEmployeeId: true,
            },
          })
        : Promise.resolve(null),
    ]);

    if (!site || site.companyId !== session.user.companyId) {
      return errorResponse("Invalid site", 403);
    }

    if (!site.isActive) {
      return errorResponse("Site is not active", 400);
    }

    if (shiftGroup) {
      if (shiftGroup.companyId !== session.user.companyId) {
        return errorResponse("Invalid shift group", 403);
      }
      if (!shiftGroup.isActive) {
        return errorResponse("Shift group is not active", 400);
      }
      if (shiftGroup.siteId !== validated.siteId) {
        return errorResponse("Shift group does not belong to the selected site", 400);
      }
    } else if (validated.shiftGroupId) {
      return errorResponse("Shift group not found", 404);
    }

    const resolvedGroupLeaderId = shiftGroup?.leaderEmployeeId ?? validated.groupLeaderId;
    if (!resolvedGroupLeaderId) {
      return errorResponse("Group leader is required", 400);
    }

    const groupLeader = await prisma.employee.findUnique({
      where: { id: resolvedGroupLeaderId },
      select: { companyId: true, isActive: true },
    });

    if (!groupLeader || groupLeader.companyId !== session.user.companyId || !groupLeader.isActive) {
      return errorResponse("Invalid group leader", 400);
    }

    // Check if report already exists for this site/date/shift
    const existing = await prisma.shiftReport.findFirst({
      where: {
        siteId: validated.siteId,
        date: new Date(validated.date),
        shift: validated.shift,
      },
    });

    if (existing) {
      return errorResponse(
        "Shift report already exists for this date and shift",
        409,
      );
    }

    // Create the shift report
    const report = await prisma.shiftReport.create({
      data: {
        date: new Date(validated.date),
        shift: validated.shift,
        siteId: validated.siteId,
        shiftGroupId: validated.shiftGroupId,
        groupLeaderId: resolvedGroupLeaderId,
        crewCount: validated.crewCount,
        workType: validated.workType,
        outputTonnes: validated.outputTonnes,
        outputTrips: validated.outputTrips,
        outputWheelbarrows: validated.outputWheelbarrows,
        metresAdvanced: validated.metresAdvanced,
        hasIncident: validated.hasIncident || false,
        incidentNotes: validated.incidentNotes,
        handoverNotes: validated.handoverNotes,
        status: "DRAFT",
        createdById: session.user.id,
      },
      include: {
        site: { select: { name: true, code: true } },
      },
    });

    return successResponse(report, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/shift-reports error:", error);
    return errorResponse("Failed to create shift report");
  }
}
