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

const trainingSchema = z.object({
  userId: z.string().uuid(),
  trainingType: z.string().min(1).max(200),
  trainingDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  expiryDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  certificateUrl: z.string().url().max(2048).optional(),
  trainedBy: z.string().max(200).optional(),
  notes: z.string().max(5000).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const expiringDays = searchParams.get("expiringDays");
    const search = searchParams.get("search");
    const { page, limit, skip } = getPaginationParams(request);

    const where: Record<string, unknown> = {
      user: { companyId: session.user.companyId },
    };
    if (userId) where.userId = userId;
    const trainingDateFilter: { gte?: Date; lte?: Date } = {};
    if (startDate) trainingDateFilter.gte = new Date(startDate);
    if (endDate) trainingDateFilter.lte = new Date(endDate);
    if (Object.keys(trainingDateFilter).length > 0) {
      where.trainingDate = trainingDateFilter;
    }
    if (expiringDays) {
      const days = Number(expiringDays);
      if (!Number.isNaN(days) && days >= 0) {
        const now = new Date();
        const until = new Date(now);
        until.setDate(until.getDate() + days);
        where.expiryDate = { gte: now, lte: until };
      }
    }
    if (search) {
      where.OR = [
        { trainingType: { contains: search, mode: "insensitive" } },
        { trainedBy: { contains: search, mode: "insensitive" } },
        { notes: { contains: search, mode: "insensitive" } },
        { user: { name: { contains: search, mode: "insensitive" } } },
      ];
    }

    const [records, total] = await Promise.all([
      prisma.trainingRecord.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
        orderBy: [{ trainingDate: "desc" }, { createdAt: "desc" }],
        skip,
        take: limit,
      }),
      prisma.trainingRecord.count({ where }),
    ]);

    return successResponse(paginationResponse(records, total, page, limit));
  } catch (error) {
    console.error("[API] GET /api/compliance/training-records error:", error);
    return errorResponse("Failed to fetch training records");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const body = await request.json();
    const validated = trainingSchema.parse(body);

    const user = await prisma.user.findUnique({
      where: { id: validated.userId },
      select: { companyId: true },
    });
    if (!user || user.companyId !== session.user.companyId) {
      return errorResponse("Invalid user", 403);
    }

    const record = await prisma.trainingRecord.create({
      data: {
        userId: validated.userId,
        trainingType: validated.trainingType,
        trainingDate: new Date(validated.trainingDate),
        expiryDate: validated.expiryDate ? new Date(validated.expiryDate) : undefined,
        certificateUrl: validated.certificateUrl,
        trainedBy: validated.trainedBy,
        notes: validated.notes,
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });

    return successResponse(record, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/compliance/training-records error:", error);
    return errorResponse("Failed to create training record");
  }
}
