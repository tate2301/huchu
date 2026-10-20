import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { drainDueFiscalReceipts } from "@/lib/accounting/fiscal-drain";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { guardBooks } from "@/lib/books/core";
import type { FiscalTab } from "@/lib/books/fiscal-labels";
import { readFiscal } from "@/lib/books/fiscal-page";
import { prisma } from "@/lib/prisma";

const TABS: FiscalTab[] = ["documents", "days", "failed"];

/** Books → Tax → Fiscal register: the documents sent to the device, the fiscal days, what failed. */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const params = new URL(request.url).searchParams;
    return successResponse(
      await readFiscal(prisma, sessionResult.session.user.companyId, {
        tab: TABS.find((value) => value === params.get("tab")) ?? "documents",
        q: params.get("q") ?? "",
        kind: params.get("kind"),
        status: params.get("status"),
        page: Number(params.get("page")) || 1,
      }),
    );
  } catch (error) {
    console.error("[API] GET /api/books/fiscal error:", error);
    return errorResponse("Could not read the fiscal register");
  }
}

const schema = z.object({ receiptId: z.string().uuid().nullish() });

/**
 * Retry the failed (or one of them): a person's press sends them to the device
 * again now, through the same drain the worker runs, however often they were
 * tried before. Each that still fails says why.
 */
export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { refused } = await guardBooks(sessionResult.session, "posting.retry");
    if (refused) return refused;
    const companyId = sessionResult.session.user.companyId;
    const { receiptId } = schema.parse(await request.json().catch(() => ({})));
    const due = await prisma.fiscalReceipt.updateMany({
      where: { companyId, status: { in: ["FAILED", "PENDING"] }, ...(receiptId ? { id: receiptId } : {}) },
      data: { nextRetryAt: new Date() },
    });
    if (due.count === 0) return successResponse({ tried: 0, signed: 0, failed: 0 });
    const result = await drainDueFiscalReceipts({ companyId, batchSize: Math.min(200, due.count), maxAttempts: 1000, notify: false });
    return successResponse({ tried: result.claimed, signed: result.succeeded, failed: result.claimed - result.succeeded, error: result.receipts.find((row) => row.outcome !== "SUCCEEDED")?.error ?? null });
  } catch (error) {
    console.error("[API] POST /api/books/fiscal error:", error);
    return errorResponse("The documents were not sent again");
  }
}
