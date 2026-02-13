import { NextRequest, NextResponse } from "next/server";
import {
  validateSession,
  errorResponse,
  successResponse,
  getPaginationParams,
  paginationResponse,
} from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { WorkType } from "@prisma/client";

// Validation schema
const shiftReportSchema = z
  .object({
    date: z
      .string()
      .datetime()
      .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
    shift: z.enum(["DAY", "NIGHT"]),
    siteId: z.string().uuid(),
    groupLeaderId: z.string().uuid(),
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
    const status = searchParams.get("status");
    const { page, limit, skip } = getPaginationParams(request);

    const where: Record<string, unknown> = {
      site: {
        companyId: session.user.companyId,
      },
    };

    if (siteId) where.siteId = siteId;
    if (startDate) {
      const dateWhere = (where.date as Record<string, Date> | undefined) ?? {};
      where.date = { ...dateWhere, gte: new Date(startDate) };
    }
    if (endDate) {
      const dateWhere = (where.date as Record<string, Date> | undefined) ?? {};
      where.date = { ...dateWhere, lte: new Date(endDate) };
    }
    if (status) where.status = status;

    const [reports, total] = await Promise.all([
      prisma.shiftReport.findMany({
        where,
        include: {
          site: { select: { name: true, code: true } },
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

    const [site, groupLeader] = await Promise.all([
      prisma.site.findUnique({
        where: { id: validated.siteId },
        select: { companyId: true, isActive: true },
      }),
      prisma.employee.findUnique({
        where: { id: validated.groupLeaderId },
        select: { companyId: true, isActive: true },
      }),
    ]);

    if (!site || site.companyId !== session.user.companyId) {
      return errorResponse("Invalid site", 403);
    }

    if (!site.isActive) {
      return errorResponse("Site is not active", 400);
    }

    if (
      !groupLeader ||
      groupLeader.companyId !== session.user.companyId ||
      !groupLeader.isActive
    ) {
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
        groupLeaderId: validated.groupLeaderId,
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
