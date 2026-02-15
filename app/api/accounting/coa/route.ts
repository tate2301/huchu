import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateSession, successResponse, errorResponse, getPaginationParams, paginationResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

const accountSchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(200),
  type: z.enum(["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"]),
  category: z.string().max(100).optional(),
  description: z.string().max(500).optional(),
  isActive: z.boolean().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search")?.trim();
    const type = searchParams.get("type");
    const active = searchParams.get("active");
    const { page, limit, skip } = getPaginationParams(request);

    const where: Record<string, unknown> = {
      companyId: session.user.companyId,
    };

    if (search) {
      where.OR = [
        { code: { contains: search, mode: "insensitive" } },
        { name: { contains: search, mode: "insensitive" } },
      ];
    }
    if (type) where.type = type;
    if (active !== null) where.isActive = active === "true";

    const [accounts, total] = await Promise.all([
      prisma.chartOfAccount.findMany({
        where,
        orderBy: [{ code: "asc" }],
        skip,
        take: limit,
      }),
      prisma.chartOfAccount.count({ where }),
    ]);

    return successResponse(paginationResponse(accounts, total, page, limit));
  } catch (error) {
    console.error("[API] GET /api/accounting/coa error:", error);
    return errorResponse("Failed to fetch chart of accounts");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const body = await request.json();
    const validated = accountSchema.parse(body);

    const existing = await prisma.chartOfAccount.findFirst({
      where: { companyId: session.user.companyId, code: validated.code },
      select: { id: true },
    });
    if (existing) {
      return errorResponse("Account code already exists", 409);
    }

    const account = await prisma.chartOfAccount.create({
      data: {
        companyId: session.user.companyId,
        code: validated.code,
        name: validated.name,
        type: validated.type,
        category: validated.category,
        description: validated.description,
        isActive: validated.isActive ?? true,
      },
    });

    return successResponse(account, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/accounting/coa error:", error);
    return errorResponse("Failed to create account");
  }
}
