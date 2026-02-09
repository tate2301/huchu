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

const permitSchema = z.object({
  permitType: z.string().min(1).max(200),
  permitNumber: z.string().min(1).max(200),
  siteId: z.string().uuid(),
  issueDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  expiryDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  responsiblePerson: z.string().min(1).max(200),
  documentUrl: z.string().url().max(2048).optional(),
  status: z.string().max(50).optional(),
});

const permitStatusFromDate = (expiryDate: Date) => {
  const now = new Date();
  if (expiryDate.getTime() < now.getTime()) return "EXPIRED";
  const soon = new Date(now);
  soon.setDate(soon.getDate() + 30);
  if (expiryDate.getTime() <= soon.getTime()) return "EXPIRING_SOON";
  return "ACTIVE";
};

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get("siteId");
    const status = searchParams.get("status");
    const search = searchParams.get("search");
    const { page, limit, skip } = getPaginationParams(request);

    const where: Record<string, unknown> = {
      site: { companyId: session.user.companyId },
    };

    if (siteId) where.siteId = siteId;
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { permitType: { contains: search, mode: "insensitive" } },
        { permitNumber: { contains: search, mode: "insensitive" } },
        { responsiblePerson: { contains: search, mode: "insensitive" } },
      ];
    }

    const [permits, total] = await Promise.all([
      prisma.permit.findMany({
        where,
        include: {
          site: { select: { id: true, name: true, code: true } },
        },
        orderBy: [{ expiryDate: "asc" }, { createdAt: "desc" }],
        skip,
        take: limit,
      }),
      prisma.permit.count({ where }),
    ]);

    return successResponse(paginationResponse(permits, total, page, limit));
  } catch (error) {
    console.error("[API] GET /api/compliance/permits error:", error);
    return errorResponse("Failed to fetch permits");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const body = await request.json();
    const validated = permitSchema.parse(body);

    const site = await prisma.site.findUnique({
      where: { id: validated.siteId },
      select: { companyId: true },
    });
    if (!site || site.companyId !== session.user.companyId) {
      return errorResponse("Invalid site", 403);
    }

    const expiryDate = new Date(validated.expiryDate);
    const permit = await prisma.permit.create({
      data: {
        permitType: validated.permitType,
        permitNumber: validated.permitNumber,
        siteId: validated.siteId,
        issueDate: new Date(validated.issueDate),
        expiryDate,
        responsiblePerson: validated.responsiblePerson,
        documentUrl: validated.documentUrl,
        status: validated.status ?? permitStatusFromDate(expiryDate),
      },
      include: {
        site: { select: { id: true, name: true, code: true } },
      },
    });

    return successResponse(permit, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/compliance/permits error:", error);
    return errorResponse("Failed to create permit");
  }
}
