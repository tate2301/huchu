import { NextRequest, NextResponse } from "next/server";
import { AccountingSourceType } from "@prisma/client";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { previewPostingFromSource } from "@/lib/accounting/posting";

const schema = z.object({
  sourceType: z.nativeEnum(AccountingSourceType),
  sourceId: z.string().optional().nullable(),
  sourceSubtype: z.string().optional().nullable(),
  siteId: z.string().uuid().optional().nullable(),
  registerCode: z.string().max(80).optional().nullable(),
  description: z.string().min(1).max(240),
  amount: z.number().min(0),
  netAmount: z.number().min(0).optional(),
  taxAmount: z.number().min(0).optional(),
  grossAmount: z.number().min(0).optional(),
  deductionsAmount: z.number().min(0).optional(),
  allowancesAmount: z.number().min(0).optional(),
  currency: z.string().max(10).optional().nullable(),
  invertDirection: z.boolean().optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
  payments: z
    .array(
      z.object({
        tenderType: z.string().min(1).max(40),
        amount: z.number().min(0),
        reference: z.string().max(120).optional().nullable(),
        currency: z.string().max(10).optional().nullable(),
      }),
    )
    .optional(),
  inventory: z
    .object({
      lines: z.array(
        z.object({
          inventoryItemId: z.string().optional(),
          itemName: z.string().optional(),
          quantity: z.number().min(0),
          unitCost: z.number().min(0),
          totalCost: z.number().min(0).optional(),
        }),
      ),
      totalCost: z.number().min(0).optional(),
    })
    .optional(),
});

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const body = await request.json();
    const validated = schema.parse(body);

    const result = await previewPostingFromSource({
      companyId: session.user.companyId,
      sourceType: validated.sourceType,
      sourceId: validated.sourceId ?? null,
      sourceSubtype: validated.sourceSubtype ?? null,
      siteId: validated.siteId ?? null,
      registerCode: validated.registerCode ?? null,
      entryDate: new Date(),
      description: validated.description,
      createdById: session.user.id,
      amount: validated.amount,
      netAmount: validated.netAmount,
      taxAmount: validated.taxAmount,
      grossAmount: validated.grossAmount,
      deductionsAmount: validated.deductionsAmount,
      allowancesAmount: validated.allowancesAmount,
      currency: validated.currency ?? undefined,
      invertDirection: validated.invertDirection ?? false,
      payload: validated.payload,
      payments: validated.payments,
      inventory: validated.inventory
        ? {
            lines: validated.inventory.lines,
            totalCost: validated.inventory.totalCost,
          }
        : undefined,
    });

    return successResponse(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/accounting/posting-rules/preview error:", error);
    return errorResponse("Failed to preview posting rule");
  }
}
