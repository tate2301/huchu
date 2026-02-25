import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  errorResponse,
  getPaginationParams,
  paginationResponse,
  successResponse,
  validateSession,
} from "@/lib/api-utils";
import { ensureApproverRole } from "@/lib/hr-payroll";
import { prisma } from "@/lib/prisma";

const createGoldPriceSchema = z.object({
  effectiveDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  priceUsdPerGram: z.number().positive(),
  note: z.string().max(1000).optional(),
});

function toDateOnly(input: string) {
  const date = new Date(input);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const { page, limit, skip } = getPaginationParams(request);

    const where: Record<string, unknown> = {
      companyId: session.user.companyId,
    };

    if (startDate || endDate) {
      const effectiveDate: Record<string, Date> = {};
      if (startDate) effectiveDate.gte = toDateOnly(startDate);
      if (endDate) effectiveDate.lte = toDateOnly(endDate);
      where.effectiveDate = effectiveDate;
    }

    const [rows, total] = await Promise.all([
      prisma.goldPrice.findMany({
        where,
        orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }],
        skip,
        take: limit,
      }),
      prisma.goldPrice.count({ where }),
    ]);

    return successResponse(paginationResponse(rows, total, page, limit));
  } catch (error) {
    console.error("[API] GET /api/gold/prices error:", error);
    return errorResponse("Failed to fetch gold prices");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    if (!ensureApproverRole(session)) {
      return errorResponse("Insufficient permissions to manage gold prices", 403);
    }

    const body = await request.json();
    const validated = createGoldPriceSchema.parse(body);
    const effectiveDate = toDateOnly(validated.effectiveDate);

    const existing = await prisma.goldPrice.findUnique({
      where: {
        companyId_effectiveDate: {
          companyId: session.user.companyId,
          effectiveDate,
        },
      },
      select: { id: true },
    });
    if (existing) {
      return errorResponse("Gold price already exists for this effective date", 409);
    }

    const created = await prisma.goldPrice.create({
      data: {
        companyId: session.user.companyId,
        effectiveDate,
        priceUsdPerGram: validated.priceUsdPerGram,
        note: validated.note?.trim() || undefined,
        createdById: session.user.id,
      },
    });

    return successResponse(created, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/gold/prices error:", error);
    return errorResponse("Failed to create gold price");
  }
}

