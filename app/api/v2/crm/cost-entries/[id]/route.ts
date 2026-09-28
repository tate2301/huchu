/**
 * One line of money, for its own page: what it was, whose, against what, and
 * its receipt.
 *
 * Read the way the register reads: somebody's own lines, or anybody's for
 * whoever may see everybody's money. Somebody else's line is not found rather
 * than refused. Whether it may still be taken back out is worked out here with
 * the same rules the delete enforces, so the page only offers what the server
 * would do.
 */
import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { isNotReceipted, receiptGaps } from "@/lib/crm/finance";
import { requireCrmCapability } from "../../_helpers";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { companyId } = session.user;
    const { id } = await params;

    const entry = await prisma.crmDailyCostEntry.findFirst({
      where: { id, companyId },
      include: {
        log: {
          select: { userId: true, logDate: true, submittedAt: true, user: { select: { id: true, name: true } } },
        },
        project: { select: { id: true, name: true, projectNo: true } },
        requisition: { select: { id: true, requisitionNo: true, status: true, purpose: true } },
        invoiceDocument: { select: { id: true, invoice: { select: { invoiceNumber: true } } } },
      },
    });
    const mine = entry?.log.userId === session.user.id;
    if (!entry || (!mine && !(await requireCrmCapability(session, "money.view_all")))) {
      return errorResponse("Entry not found", 404);
    }

    const gaps = entry.invoiceDocumentId
      ? await receiptGaps(prisma, companyId, { invoiceDocumentIds: [entry.invoiceDocumentId] })
      : new Map();

    // The day's report, once the day is closed, so the line can say which
    // report it was part of.
    const report = entry.log.submittedAt
      ? await prisma.crmDailyReport.findFirst({
          where: { companyId, userId: entry.log.userId, reportDate: entry.log.logDate },
          select: { id: true },
        })
      : null;

    return successResponse({
      entry: { ...entry, notReceipted: isNotReceipted(entry, gaps) },
      reportId: report?.id ?? null,
      mayRemove: mine && !entry.log.submittedAt && entry.requisition?.status !== "ACQUITTED",
    });
  } catch (error) {
    console.error("[API] GET /api/v2/crm/cost-entries/[id] error:", error);
    return errorResponse("Failed to load the entry");
  }
}
