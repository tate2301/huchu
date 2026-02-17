import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateSession, successResponse, errorResponse, getPaginationParams, paginationResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

const accountSchema = z.object({
  name: z.string().min(1).max(200),
  bankName: z.string().max(200).optional(),
  accountNumber: z.string().max(100).optional(),
  currency: z.string().min(1).max(10).optional(),
  openingBalance: z.number().min(0).optional(),
  isActive: z.boolean().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const active = searchParams.get("active");
    const { page, limit, skip } = getPaginationParams(request);

    const where: Record<string, unknown> = { companyId: session.user.companyId };
    if (active !== null) where.isActive = active === "true";

    const [accounts, total] = await Promise.all([
      prisma.bankAccount.findMany({
        where,
        orderBy: [{ name: "asc" }],
        skip,
        take: limit,
      }),
      prisma.bankAccount.count({ where }),
    ]);

    return successResponse(paginationResponse(accounts, total, page, limit));
  } catch (error) {
    console.error("[API] GET /api/accounting/banking/accounts error:", error);
    return errorResponse("Failed to fetch bank accounts");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const body = await request.json();
    const validated = accountSchema.parse(body);

    const account = await prisma.bankAccount.create({
      data: {
        companyId: session.user.companyId,
        name: validated.name,
        bankName: validated.bankName,
        accountNumber: validated.accountNumber,
        currency: validated.currency ?? "USD",
        openingBalance: validated.openingBalance ?? 0,
        isActive: validated.isActive ?? true,
      },
    });

    return successResponse(account, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/accounting/banking/accounts error:", error);
    return errorResponse("Failed to create bank account");
  }
}
