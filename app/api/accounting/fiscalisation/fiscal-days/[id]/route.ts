import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { hasRole } from "@/lib/roles";
import {
  closeFiscalDay,
  FiscalDayHasPendingReceiptsError,
  FiscalDayNotFoundError,
  FiscalDayNotOpenError,
} from "@/lib/accounting/fiscal-day";
import {
  type BlockingReceiptRow,
  toBlockingReceiptWire,
} from "@/components/accounting/fiscalisation/receipt-mapping";
import type {
  BlockingReceiptWire,
  FiscalDayCounterWire,
  FiscalDayDetailResponse,
  FiscalDayStatusWire,
} from "@/components/accounting/fiscalisation/types";

/**
 * FD-7.1 / FD-2.2 — one fiscal day: what it holds, and closing it.
 *
 * The close half exists mostly to answer *why not*. `closeFiscalDay` refuses a
 * day with unsubmitted receipts and names them on the error; this route's job
 * is to make sure that list survives the trip to the screen with enough on each
 * row to find the physical document. "This day cannot close" is not something a
 * supervisor can act on at 6pm — "till sale RS-1043, global no 812, FAILED 40
 * minutes ago" is, and the difference between the two is the whole story.
 *
 * The refusal is a 409, not a 500: nothing is broken. A receipt is queued or
 * failed and the day is correctly declining to submit a Z-report that would
 * cover a receipt ZIMRA has never seen.
 *
 * No aggregation, signing or state machine lives here — that is
 * `lib/accounting/fiscal-day.ts`. This route reads, delegates, and translates
 * the service's named errors into HTTP.
 */

const MANAGE_ROLES = ["SUPERADMIN", "MANAGER", "SHOP_MANAGER", "FINANCE_OFFICER"] as const;

/** Deeper than the fleet preview: this is the screen a supervisor opens
 *  precisely because a day will not close, so the list should mostly be whole. */
const BLOCKING_DETAIL_LIMIT = 50;

const UNSUBMITTED_STATUSES = ["PENDING", "FAILED"] as const;

const actionSchema = z.object({
  action: z.literal("close"),
});

type RouteParams = { params: Promise<{ id: string }> };

const BLOCKING_SELECT = {
  id: true,
  status: true,
  receiptNumber: true,
  fiscalNumber: true,
  receiptCounter: true,
  receiptGlobalNo: true,
  createdAt: true,
  lastError: true,
  attemptCount: true,
  nextRetryAt: true,
  invoiceId: true,
  schoolReceiptId: true,
  creditNoteId: true,
  retailSaleId: true,
  invoice: { select: { invoiceNumber: true } },
  schoolReceipt: { select: { receiptNo: true } },
  creditNote: { select: { noteNumber: true } },
  retailSale: { select: { saleNo: true } },
} as const;

async function loadBlocking(dayId: string): Promise<{
  receipts: BlockingReceiptWire[];
  truncated: boolean;
}> {
  const [rows, total] = await Promise.all([
    prisma.fiscalReceipt.findMany({
      where: { fiscalDayId: dayId, status: { in: [...UNSUBMITTED_STATUSES] } },
      orderBy: { createdAt: "asc" },
      take: BLOCKING_DETAIL_LIMIT,
      select: BLOCKING_SELECT,
    }) as Promise<BlockingReceiptRow[]>,
    prisma.fiscalReceipt.count({
      where: { fiscalDayId: dayId, status: { in: [...UNSUBMITTED_STATUSES] } },
    }),
  ]);
  return { receipts: rows.map(toBlockingReceiptWire), truncated: total > rows.length };
}

/**
 * The persisted Z-report, or null.
 *
 * `countersJson` is written once, at close, by `buildFiscalDayCountersJson`, so
 * for a closed day it is the exact counter set that was signed — read back
 * rather than recomputed, because recomputing could disagree with what ZIMRA
 * was told and the signed bytes are the ones that matter.
 *
 * An open day returns null. Its tax breakdown does not exist yet, and rendering
 * a zero-filled table would look like a reconciled report rather than "not yet".
 */
function readCounters(countersJson: string | null): {
  counters: FiscalDayCounterWire[] | null;
  receiptsWithoutTaxLines: string[];
} {
  if (!countersJson) return { counters: null, receiptsWithoutTaxLines: [] };
  try {
    const parsed = JSON.parse(countersJson) as {
      counters?: FiscalDayCounterWire[];
      receiptsWithoutTaxLines?: string[];
    };
    return {
      counters: Array.isArray(parsed.counters) ? parsed.counters : [],
      receiptsWithoutTaxLines: Array.isArray(parsed.receiptsWithoutTaxLines)
        ? parsed.receiptsWithoutTaxLines
        : [],
    };
  } catch {
    // A Z-report we cannot read back is a real problem, but it is the auditor's
    // problem, not a reason to fail the page that would show it.
    return { counters: [], receiptsWithoutTaxLines: [] };
  }
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;

    // companyId in the WHERE, not checked after the read: a day belonging to
    // another tenant must be indistinguishable from one that does not exist.
    const day = await prisma.fiscalDay.findFirst({
      where: { id, companyId: session.user.companyId },
      include: { providerConfig: { select: { providerKey: true, metadataJson: true } } },
    });
    if (!day) return errorResponse("Fiscal day not found", 404);

    const [statusCounts, blocking] = await Promise.all([
      prisma.fiscalReceipt.groupBy({
        by: ["status"],
        where: { fiscalDayId: day.id },
        _count: { _all: true },
      }),
      loadBlocking(day.id),
    ]);

    const countFor = (status: string) =>
      statusCounts.find((row) => row.status === status)?._count._all ?? 0;
    const pending = countFor("PENDING");
    const failed = countFor("FAILED");

    const { counters, receiptsWithoutTaxLines } = readCounters(day.countersJson);

    let siteLabel: string | null = null;
    if (day.providerConfig.metadataJson) {
      try {
        const meta = JSON.parse(day.providerConfig.metadataJson) as Record<string, unknown>;
        const pick = (key: string) =>
          typeof meta[key] === "string" && meta[key] ? (meta[key] as string) : null;
        siteLabel = pick("siteName") ?? pick("branch") ?? pick("site") ?? pick("location");
      } catch {
        siteLabel = null;
      }
    }

    const response: FiscalDayDetailResponse = {
      day: {
        id: day.id,
        fiscalDayNo: day.fiscalDayNo,
        status: day.status as FiscalDayStatusWire,
        deviceId: day.deviceId,
        openedAt: day.openedAt.toISOString(),
        closedAt: day.closedAt?.toISOString() ?? null,
        lastReceiptCounter: day.lastReceiptCounter,
        lastReceiptGlobalNo: day.lastReceiptGlobalNo,
        lastReceiptHash: day.lastReceiptHash,
        lastError: day.lastError,
        providerConfigId: day.providerConfigId,
        providerKey: day.providerConfig.providerKey,
        siteLabel,
        closingSignature: day.closingSignature,
      },
      receiptCounts: {
        total: statusCounts.reduce((sum, row) => sum + row._count._all, 0),
        accepted: countFor("SUCCESS"),
        pending,
        failed,
        blocking: pending + failed,
      },
      blockingReceipts: blocking.receipts,
      blockingTruncated: blocking.truncated,
      counters,
      receiptsWithoutTaxLines,
    };

    return successResponse(response);
  } catch (error) {
    console.error("[API] GET /api/accounting/fiscalisation/fiscal-days/[id] error:", error);
    return errorResponse("Failed to load fiscal day");
  }
}

/**
 * Close the day.
 *
 * `closeFiscalDay` is called without `taxLinesByReceiptId` because there is
 * nothing to pass: the signed per-tax breakdown is built at issue time and is
 * not persisted on `FiscalReceipt`, so a console close cannot reconstruct it.
 * The service reports every such receipt in `receiptsWithoutTaxLines`, and this
 * route hands that straight back as `countersIncomplete` rather than letting a
 * Z-report with empty tax counters look finished. A supervisor finding out from
 * ZIMRA that the report under-reported is the outcome this exists to prevent.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;

    if (!hasRole(session.user.role, [...MANAGE_ROLES])) {
      return errorResponse("Insufficient permissions to close a fiscal day", 403);
    }

    const body = await request.json().catch(() => ({}));
    actionSchema.parse(body);

    const result = await closeFiscalDay({
      dayId: id,
      // Passed so the service refuses another tenant's day with its own
      // not-found error rather than this route re-checking after the fact.
      companyId: session.user.companyId,
    });

    return successResponse({
      dayId: result.day.id,
      fiscalDayNo: result.day.fiscalDayNo,
      status: result.day.status,
      closedAt: result.day.closedAt?.toISOString() ?? null,
      alreadyClosed: result.alreadyClosed,
      receiptCount: result.counters.receiptCount,
      counters: result.counters.counters,
      /** Non-empty means the Z-report under-reports; see the doc comment. */
      receiptsWithoutTaxLines: result.counters.receiptsWithoutTaxLines,
      countersIncomplete: result.counters.receiptsWithoutTaxLines.length > 0,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof FiscalDayHasPendingReceiptsError) {
      // Re-read the offending rows rather than forwarding the error's bare
      // id/status triples: the supervisor needs the source document number and
      // the failure text to decide between replaying and voiding, and that is
      // the only reason this refusal is worth showing at all.
      const blocking = await loadBlocking(error.dayId);
      return errorResponse(error.message, 409, {
        code: error.code,
        dayId: error.dayId,
        blockingCount: error.receipts.length,
        blockingReceipts: blocking.receipts,
        blockingTruncated: blocking.truncated,
      });
    }
    if (error instanceof FiscalDayNotFoundError) {
      return errorResponse("Fiscal day not found", 404, { code: error.code });
    }
    if (error instanceof FiscalDayNotOpenError) {
      return errorResponse(error.message, 409, { code: error.code, status: error.status });
    }
    console.error("[API] POST /api/accounting/fiscalisation/fiscal-days/[id] error:", error);
    return errorResponse("Failed to close fiscal day");
  }
}
