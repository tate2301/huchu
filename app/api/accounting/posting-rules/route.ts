import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateSession, successResponse, errorResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

const ruleSchema = z.object({
  name: z.string().min(1).max(200),
  sourceType: z.enum([
    "STOCK_RECEIPT",
    "STOCK_ISSUE",
    "STOCK_ADJUSTMENT",
    "PAYROLL_RUN",
    "PAYROLL_DISBURSEMENT",
    "GOLD_RECEIPT",
    "GOLD_DISPATCH",
    "SALES_INVOICE",
    "SALES_RECEIPT",
    "PURCHASE_BILL",
    "PURCHASE_PAYMENT",
    "BANK_TRANSACTION",
    "MAINTENANCE_COMPLETION",
  ]),
  isActive: z.boolean().optional(),
  lines: z
    .array(
      z.object({
        accountId: z.string().uuid(),
        direction: z.enum(["DEBIT", "CREDIT"]),
        basis: z.enum(["AMOUNT", "NET", "TAX", "GROSS", "DEDUCTIONS", "ALLOWANCES"]),
        allocationType: z.enum(["PERCENT", "FIXED"]).optional(),
        allocationValue: z.number().min(0).optional(),
      }),
    )
    .min(2),
});

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const rules = await prisma.postingRule.findMany({
      where: { companyId: session.user.companyId },
      include: {
        lines: { include: { account: { select: { code: true, name: true } } } },
      },
      orderBy: [{ sourceType: "asc" }],
    });

    return successResponse(rules);
  } catch (error) {
    console.error("[API] GET /api/accounting/posting-rules error:", error);
    return errorResponse("Failed to fetch posting rules");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const body = await request.json();
    const validated = ruleSchema.parse(body);

    const rule = await prisma.postingRule.upsert({
      where: {
        companyId_sourceType: {
          companyId: session.user.companyId,
          sourceType: validated.sourceType,
        },
      },
      update: {
        name: validated.name,
        isActive: validated.isActive ?? true,
        lines: {
          deleteMany: {},
          create: validated.lines.map((line) => ({
            accountId: line.accountId,
            direction: line.direction,
            basis: line.basis,
            allocationType: line.allocationType ?? "PERCENT",
            allocationValue: line.allocationValue ?? 100,
          })),
        },
      },
      create: {
        companyId: session.user.companyId,
        name: validated.name,
        sourceType: validated.sourceType,
        isActive: validated.isActive ?? true,
        lines: {
          create: validated.lines.map((line) => ({
            accountId: line.accountId,
            direction: line.direction,
            basis: line.basis,
            allocationType: line.allocationType ?? "PERCENT",
            allocationValue: line.allocationValue ?? 100,
          })),
        },
      },
      include: {
        lines: { include: { account: { select: { code: true, name: true } } } },
      },
    });

    return successResponse(rule, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/accounting/posting-rules error:", error);
    return errorResponse("Failed to save posting rule");
  }
}
