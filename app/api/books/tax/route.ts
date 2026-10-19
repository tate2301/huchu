import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { readWhatsDue } from "@/lib/books/tax-due";
import type { DueTax } from "@/lib/books/tax-labels";
import { prisma } from "@/lib/prisma";

const TAXES = ["all", "vat", "paye", "wht", "qpd", "income"] as const;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Books → Tax → What's due: every return and payment ZIMRA expects in the months asked for. */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const params = new URL(request.url).searchParams;
    const from = params.get("from");
    const to = params.get("to");
    const tax = (TAXES as readonly string[]).includes(params.get("tax") ?? "") ? (params.get("tax") as DueTax | "all") : "all";
    return successResponse(
      await readWhatsDue(prisma, sessionResult.session.user.companyId, {
        from: from && DAY.test(from) ? from : undefined,
        to: to && DAY.test(to) ? to : undefined,
        tax,
        q: params.get("q") ?? "",
      }),
    );
  } catch (error) {
    console.error("[API] GET /api/books/tax error:", error);
    return errorResponse("Could not read what is due");
  }
}
