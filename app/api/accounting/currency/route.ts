import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateSession, successResponse, errorResponse, getPaginationParams, paginationResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

const rateSchema = z.object({
  baseCurrency: z.string().min(1).max(10),
  quoteCurrency: z.string().min(1).max(10),
  rate: z.number().positive(),
  effectiveDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
});

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const baseCurrency = searchParams.get("baseCurrency");
    const quoteCurrency = searchParams.get("quoteCurrency");
    const { page, limit, skip } = getPaginationParams(request);

    const where: Record<string, unknown> = { companyId: session.user.companyId };
    if (baseCurrency) where.baseCurrency = baseCurrency;
    if (quoteCurrency) where.quoteCurrency = quoteCurrency;

    const [rates, total] = await Promise.all([
      prisma.currencyRate.findMany({
        where,
        orderBy: [{ effectiveDate: "desc" }],
        skip,
        take: limit,
      }),
      prisma.currencyRate.count({ where }),
    ]);

    return successResponse(paginationResponse(rates, total, page, limit));
  } catch (error) {
    console.error("[API] GET /api/accounting/currency error:", error);
    return errorResponse("Failed to fetch currency rates");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const body = await request.json();
    const validated = rateSchema.parse(body);

    const rate = await prisma.currencyRate.create({
      data: {
        companyId: session.user.companyId,
        baseCurrency: validated.baseCurrency.toUpperCase(),
        quoteCurrency: validated.quoteCurrency.toUpperCase(),
        rate: validated.rate,
        effectiveDate: new Date(validated.effectiveDate),
      },
    });

    return successResponse(rate, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/accounting/currency error:", error);
    return errorResponse("Failed to create currency rate");
  }
}
