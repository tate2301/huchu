import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  errorResponse,
  getPaginationParams,
  paginationResponse,
  successResponse,
  validateSession,
} from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

const inspectionSchema = z.object({
  siteId: z.string().uuid(),
  inspectionDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  inspectorName: z.string().min(1).max(200),
  inspectorOrg: z.string().min(1).max(200),
  findings: z.string().min(1).max(5000),
  actions: z.string().max(5000).optional(),
  actionsDue: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  completedById: z.string().uuid().optional(),
  completedAt: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  documentUrl: z.string().url().max(2048).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get("siteId");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const overdue = searchParams.get("overdue");
    const search = searchParams.get("search");
    const { page, limit, skip } = getPaginationParams(request);

    const where: Record<string, unknown> = {
      site: { companyId: session.user.companyId },
    };
    if (siteId) where.siteId = siteId;
    const inspectionDateFilter: { gte?: Date; lte?: Date } = {};
    if (startDate) inspectionDateFilter.gte = new Date(startDate);
    if (endDate) inspectionDateFilter.lte = new Date(endDate);
    if (Object.keys(inspectionDateFilter).length > 0) {
      where.inspectionDate = inspectionDateFilter;
    }
    if (overdue === "true") {
      where.actionsDue = { lt: new Date() };
      where.completedAt = null;
    }
    if (search) {
      where.OR = [
        { inspectorName: { contains: search, mode: "insensitive" } },
        { inspectorOrg: { contains: search, mode: "insensitive" } },
        { findings: { contains: search, mode: "insensitive" } },
      ];
    }

    const [inspections, total] = await Promise.all([
      prisma.inspection.findMany({
        where,
        include: {
          site: { select: { id: true, name: true, code: true } },
          completedBy: { select: { id: true, name: true } },
        },
        orderBy: [{ inspectionDate: "desc" }, { createdAt: "desc" }],
        skip,
        take: limit,
      }),
      prisma.inspection.count({ where }),
    ]);

    return successResponse(paginationResponse(inspections, total, page, limit));
  } catch (error) {
    console.error("[API] GET /api/compliance/inspections error:", error);
    return errorResponse("Failed to fetch inspections");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const body = await request.json();
    const validated = inspectionSchema.parse(body);

    const site = await prisma.site.findUnique({
      where: { id: validated.siteId },
      select: { companyId: true },
    });
    if (!site || site.companyId !== session.user.companyId) {
      return errorResponse("Invalid site", 403);
    }

    if (validated.completedById) {
      const user = await prisma.user.findUnique({
        where: { id: validated.completedById },
        select: { companyId: true },
      });
      if (!user || user.companyId !== session.user.companyId) {
        return errorResponse("Invalid completion user", 400);
      }
    }

    const inspection = await prisma.inspection.create({
      data: {
        siteId: validated.siteId,
        inspectionDate: new Date(validated.inspectionDate),
        inspectorName: validated.inspectorName,
        inspectorOrg: validated.inspectorOrg,
        findings: validated.findings,
        actions: validated.actions,
        actionsDue: validated.actionsDue ? new Date(validated.actionsDue) : undefined,
        completedById: validated.completedById,
        completedAt: validated.completedAt ? new Date(validated.completedAt) : undefined,
        documentUrl: validated.documentUrl,
      },
      include: {
        site: { select: { id: true, name: true, code: true } },
        completedBy: { select: { id: true, name: true } },
      },
    });

    return successResponse(inspection, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/compliance/inspections error:", error);
    return errorResponse("Failed to create inspection");
  }
}
