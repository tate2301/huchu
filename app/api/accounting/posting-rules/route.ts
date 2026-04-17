import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AccountingSourceType } from "@prisma/client";
import {
  validateSession,
  successResponse,
  errorResponse,
} from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import {
  findForeignAccountIds,
  findForeignCostCenterIds,
  findForeignTaxCodeIds,
} from "@/lib/accounting/ownership";

const conditionSchema = z.object({
  field: z.enum([
    "SITE_ID",
    "REGISTER_CODE",
    "TENDER_TYPE",
    "CURRENCY",
    "CUSTOMER_TAX_CATEGORY_ID",
    "VENDOR_TAX_CATEGORY_ID",
    "SALE_TYPE",
    "MOVEMENT_TYPE",
  ]),
  operator: z.enum(["EQ", "NEQ", "IN", "NOT_IN", "EXISTS", "NOT_EXISTS"]),
  valueString: z.string().optional().nullable(),
  valueListJson: z.string().optional().nullable(),
});

const lineSchema = z.object({
  accountId: z.string().uuid().optional().nullable(),
  direction: z.enum(["DEBIT", "CREDIT"]),
  basis: z.enum(["AMOUNT", "NET", "TAX", "GROSS", "DEDUCTIONS", "ALLOWANCES"]),
  taxCodeId: z.string().uuid().optional().nullable(),
  allocationType: z.enum(["PERCENT", "FIXED"]).optional().nullable(),
  allocationValue: z.number().min(0).optional().nullable(),
  repeatMode: z.enum(["NONE", "TENDER"]).optional().default("NONE"),
  accountSource: z
    .enum(["FIXED_ACCOUNT", "TENDER_MAPPING"])
    .optional()
    .default("FIXED_ACCOUNT"),
  valuePath: z.string().optional().nullable(),
  memoTemplate: z.string().optional().nullable(),
  costCenterId: z.string().uuid().optional().nullable(),
  sortOrder: z.number().int().optional().default(0),
});

const ruleSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(500).optional().nullable(),
  sourceType: z.nativeEnum(AccountingSourceType),
  priority: z.number().int().min(0).max(9999).optional().default(100),
  scopeType: z.enum(["COMPANY", "SITE"]).optional().default("COMPANY"),
  siteId: z.string().uuid().optional().nullable(),
  ruleMode: z.enum(["GUIDED", "ADVANCED"]).optional().default("GUIDED"),
  isFallback: z.boolean().optional().default(false),
  isActive: z.boolean().optional().default(true),
  conditions: z.array(conditionSchema).optional().default([]),
  lines: z.array(lineSchema).min(2),
});

function validateConditionLists(
  conditions: Array<{
    operator: "EQ" | "NEQ" | "IN" | "NOT_IN" | "EXISTS" | "NOT_EXISTS";
    valueListJson?: string | null;
  }>,
) {
  for (const condition of conditions) {
    if (condition.operator !== "IN" && condition.operator !== "NOT_IN") continue;
    if (!condition.valueListJson) {
      return "IN and NOT_IN conditions require a JSON array of values";
    }
    try {
      const parsed = JSON.parse(condition.valueListJson);
      if (!Array.isArray(parsed) || parsed.some((value) => typeof value !== "string")) {
        return "Condition value lists must be valid JSON arrays of strings";
      }
    } catch {
      return "Condition value lists must be valid JSON arrays of strings";
    }
  }
  return null;
}

// GET /api/accounting/posting-rules
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;

    const rules = await prisma.postingRule.findMany({
      where: { companyId },
      include: {
        lines: {
          include: { account: { select: { code: true, name: true } } },
          orderBy: { sortOrder: "asc" },
        },
        conditions: { orderBy: { id: "asc" } },
      },
      orderBy: [{ sourceType: "asc" }, { priority: "asc" }, { name: "asc" }],
    });

    return successResponse(rules);
  } catch (error) {
    console.error("[API] GET /api/accounting/posting-rules error:", error);
    return errorResponse("Failed to fetch posting rules", 500);
  }
}

// POST /api/accounting/posting-rules — create a new rule
export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;

    const body = await request.json();
    const parsed = ruleSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.flatten().fieldErrors, 400);
    }

    const data = parsed.data;
    const conditionListError = validateConditionLists(data.conditions ?? []);
    if (conditionListError) {
      return errorResponse(conditionListError, 400);
    }
    const normalizedSiteId = data.scopeType === "SITE" ? data.siteId ?? null : null;

    if (data.scopeType === "SITE" && !normalizedSiteId) {
      return errorResponse("A site-specific rule requires a siteId", 400);
    }

    if (normalizedSiteId) {
      const site = await prisma.site.findFirst({
        where: { id: normalizedSiteId, companyId, isActive: true },
        select: { id: true },
      });
      if (!site) {
        return errorResponse("Selected site was not found for this company", 400);
      }
    }

    const missingFixedAccount = data.lines.some(
      (line) => line.accountSource !== "TENDER_MAPPING" && !line.accountId,
    );
    if (missingFixedAccount) {
      return errorResponse("Fixed-account lines require an account selection", 400);
    }

    // Validate account ownership
    const fixedAccountIds = data.lines
      .filter(
        (l) => l.accountSource !== "TENDER_MAPPING" && l.accountId,
      )
      .map((l) => l.accountId!)
      .filter(Boolean);

    if (fixedAccountIds.length > 0) {
      const foreign = await findForeignAccountIds(companyId, fixedAccountIds);
      if (foreign.length > 0) {
        return errorResponse(
          `Accounts not found in company: ${foreign.join(", ")}`,
          400,
        );
      }
    }

    const costCenterIds = data.lines
      .map((line) => line.costCenterId)
      .filter(Boolean) as string[];
    if (costCenterIds.length > 0) {
      const foreignCostCenters = await findForeignCostCenterIds(companyId, costCenterIds);
      if (foreignCostCenters.length > 0) {
        return errorResponse(
          `Cost centers not found in company: ${foreignCostCenters.join(", ")}`,
          400,
        );
      }
    }

    const taxCodeIds = data.lines
      .map((l) => l.taxCodeId)
      .filter(Boolean) as string[];
    if (taxCodeIds.length > 0) {
      const foreignTax = await findForeignTaxCodeIds(companyId, taxCodeIds);
      if (foreignTax.length > 0) {
        return errorResponse(
          `Tax codes not found in company: ${foreignTax.join(", ")}`,
          400,
        );
      }
    }

    const rule = await prisma.postingRule.create({
      data: {
        companyId,
        name: data.name,
        description: data.description,
        sourceType: data.sourceType,
        priority: data.priority,
        scopeType: data.scopeType,
        siteId: normalizedSiteId,
        ruleMode: data.ruleMode,
        isFallback: data.isFallback,
        isActive: data.isActive ?? true,
        lines: {
          create: data.lines.map((line, idx) => ({
            accountId: line.accountId,
            direction: line.direction,
            basis: line.basis,
            taxCodeId: line.taxCodeId,
            allocationType: line.allocationType ?? "PERCENT",
            allocationValue: line.allocationValue ?? 100,
            repeatMode: line.repeatMode ?? "NONE",
            accountSource: line.accountSource ?? "FIXED_ACCOUNT",
            valuePath: line.valuePath,
            memoTemplate: line.memoTemplate,
            costCenterId: line.costCenterId,
            sortOrder: line.sortOrder ?? idx,
          })),
        },
        conditions: {
          create: (data.conditions ?? []).map((cond) => ({
            field: cond.field,
            operator: cond.operator,
            valueString: cond.valueString,
            valueListJson: cond.valueListJson,
          })),
        },
      },
      include: {
        lines: {
          include: { account: { select: { code: true, name: true } } },
          orderBy: { sortOrder: "asc" },
        },
        conditions: true,
      },
    });

    return successResponse(rule, 201);
  } catch (error) {
    console.error("[API] POST /api/accounting/posting-rules error:", error);
    return errorResponse("Failed to create posting rule", 500);
  }
}
