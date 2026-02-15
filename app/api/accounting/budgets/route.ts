import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateSession, successResponse, errorResponse, getPaginationParams, paginationResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

const budgetSchema = z.object({
  name: z.string().min(1).max(200),
  startDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  endDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  status: z.enum(["DRAFT", "ACTIVE", "CLOSED"]).optional(),
  totalAmount: z.number().min(0),
  notes: z.string().max(1000).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const { page, limit, skip } = getPaginationParams(request);

    const where: Record<string, unknown> = { companyId: session.user.companyId };
    if (status) where.status = status;

    const [budgets, total] = await Promise.all([
      prisma.budget.findMany({
        where,
        orderBy: [{ startDate: "desc" }],
        skip,
        take: limit,
      }),
      prisma.budget.count({ where }),
    ]);

    return successResponse(paginationResponse(budgets, total, page, limit));
  } catch (error) {
    console.error("[API] GET /api/accounting/budgets error:", error);
    return errorResponse("Failed to fetch budgets");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const body = await request.json();
    const validated = budgetSchema.parse(body);

    const budget = await prisma.budget.create({
      data: {
        companyId: session.user.companyId,
        name: validated.name,
        startDate: new Date(validated.startDate),
        endDate: new Date(validated.endDate),
        status: validated.status ?? "DRAFT",
        totalAmount: validated.totalAmount,
        notes: validated.notes,
      },
    });

    return successResponse(budget, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/accounting/budgets error:", error);
    return errorResponse("Failed to create budget");
  }
}
