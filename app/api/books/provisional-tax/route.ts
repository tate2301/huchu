import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { guardBooks } from "@/lib/books/core";
import { saveTaxSettings, taxSettings } from "@/lib/books/core/tax-settings";
import { readProvisional } from "@/lib/books/provisional-page";
import { prisma } from "@/lib/prisma";

/** Books → Tax → Provisional tax: the year's estimate, its four instalments and what was paid. */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const year = Number(new URL(request.url).searchParams.get("year")) || new Date().getUTCFullYear();
    return successResponse(await readProvisional(prisma, sessionResult.session.user.companyId, year));
  } catch (error) {
    console.error("[API] GET /api/books/provisional-tax error:", error);
    return errorResponse("Could not read provisional tax");
  }
}

const schema = z.object({ year: z.number().int().min(2000).max(2100), taxUsd: z.number().min(0), incomeUsd: z.number().min(0).nullish(), split5050: z.boolean().optional() });

/** Revise the year's estimate (owner, manager or accountant): the instalments follow from it. */
export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { refused } = await guardBooks(sessionResult.session, "vat.prepare");
    if (refused) return refused;
    const body = schema.parse(await request.json());
    const companyId = sessionResult.session.user.companyId;
    const current = await taxSettings(companyId);
    const estimates = {
      ...current.provisional.estimates,
      [String(body.year)]: { taxUsd: body.taxUsd, incomeUsd: body.incomeUsd ?? null, split5050: body.split5050 ?? false, foreignShare: body.split5050 ? 0.5 : null, revisedAt: new Date().toISOString(), revisedBy: sessionResult.session.user.name ?? null },
    };
    await saveTaxSettings(companyId, { provisional: { estimates } });
    return successResponse({ year: body.year });
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Enter the year's estimate", 400, error.issues);
    console.error("[API] POST /api/books/provisional-tax error:", error);
    return errorResponse("The estimate was not saved");
  }
}
