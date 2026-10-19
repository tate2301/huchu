import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { guardBooks } from "@/lib/books/core";
import { saveTaxSettings, TO_CONFIRM } from "@/lib/books/core/tax-settings";
import { readSettingsTax } from "@/lib/books/settings-tax";
import { prisma } from "@/lib/prisma";

/** Books → Settings → Tax codes & rules: the codes, and ZIMRA's dates and rates as settings. */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const params = new URL(request.url).searchParams;
    return successResponse(await readSettingsTax(prisma, sessionResult.session.user.companyId, { q: params.get("q") ?? "", kind: params.get("kind") ?? "all" }));
  } catch (error) {
    console.error("[API] GET /api/books/settings/tax error:", error);
    return errorResponse("Could not read the tax settings");
  }
}

const day = z.number().int().min(1).max(28);
const mmdd = z.string().regex(/^\d{2}-\d{2}$/);
const schema = z.object({
  vat: z.object({ category: z.enum(["A", "B", "C", "D"]), periodMonths: z.number().int().min(1).max(12), returnDay: day, paymentDay: day, withholdingAgent: z.boolean() }).partial().optional(),
  withholding: z.object({ contractRate: z.number().min(0).max(1), thresholdUsd: z.number().min(0), returnDay: day, paymentDay: day }).partial().optional(),
  paye: z.object({ returnDay: day, paymentDay: day }).partial().optional(),
  provisional: z.object({ paymentDates: z.tuple([mmdd, mmdd, mmdd, mmdd]), returnDates: z.tuple([mmdd, mmdd, mmdd, mmdd]) }).partial().optional(),
  imtt: z.object({ usdRate: z.number().min(0).max(1), zwgRate: z.number().min(0).max(1), flatOverUsd: z.number().min(0), flatAmountUsd: z.number().min(0) }).partial().optional(),
  confirmed: z.array(z.string().refine((key) => key in TO_CONFIRM)).optional(),
});

/** Save ZIMRA's dates and rates (owner or accountant). A FLAGged value saved, or confirmed as it is, stops saying "To confirm". */
export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { refused } = await guardBooks(sessionResult.session, "setup");
    if (refused) return refused;
    const patch = schema.parse(await request.json());
    return successResponse(await saveTaxSettings(sessionResult.session.user.companyId, patch));
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Check the values", 400, error.issues);
    console.error("[API] POST /api/books/settings/tax error:", error);
    return errorResponse("The tax settings were not saved");
  }
}
