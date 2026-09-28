/**
 * Money in and money out, one line at a time — the one door every spend or
 * income line comes through.
 *
 * The daily tracker, a requisition's report and a project's "Add spend" all
 * post here, and all of it goes through `addCostEntry`, so there is one ledger
 * of field money rather than three that add up slightly differently. A line
 * lands on its author's log for the day it names, which is what makes the
 * receipt photographed on a requisition's page show on that person's day too.
 *
 * POST is idempotent when the device supplies a `clientEntryId`, which the
 * offline outbox always does. A replayed entry lands once; without that a bad
 * afternoon on the road doubles the day's spend.
 *
 * GET is the cost tracker's register: a person's own lines, or — for
 * somebody who may see everybody's money — everybody's unless they narrow it
 * to one person.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";

import {
  errorResponse,
  getPaginationParams,
  paginationResponse,
  successResponse,
  validateSession,
} from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import {
  CostEntryError,
  addCostEntry,
  costEntrySchema,
  dayTotals,
  toLogDate,
} from "@/lib/crm/daily-log";
import { isNotReceipted, receiptGaps, type ReceiptGap } from "@/lib/crm/finance";
import { postCostEntry } from "@/lib/crm/money-posting";
import { canReport, type RequisitionStatus } from "@/lib/crm/requisitions";
import { requireCrmCapability } from "../_helpers";

const ENTRY_INCLUDE = {
  log: { select: { logDate: true, submittedAt: true, user: { select: { id: true, name: true } } } },
  project: { select: { id: true, name: true, projectNo: true } },
  requisition: { select: { id: true, requisitionNo: true, status: true } },
  invoiceDocument: { select: { id: true, invoice: { select: { invoiceNumber: true } } } },
} satisfies Prisma.CrmDailyCostEntryInclude;

/** A `YYYY-MM-DD` query value as the DATE a log is keyed on, or null. */
function dayParam(value: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : toLogDate(date);
}

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { companyId } = session.user;

    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = getPaginationParams(request);

    // Whose money. A member reads their own. Somebody who may see everybody's
    // money reads everybody's, or one person's — their own included — when
    // they ask. Asking for somebody else without that is refused rather than
    // quietly answered with your own.
    const mayViewAll = await requireCrmCapability(session, "money.view_all");
    const person = searchParams.get("person") ?? (mayViewAll ? "all" : "me");
    let userId: string | null = session.user.id;
    if (person === "all") {
      if (!mayViewAll) return errorResponse("You can only see your own money", 403);
      userId = null;
    } else if (person !== "me" && person !== session.user.id) {
      if (!mayViewAll) return errorResponse("You can only see your own money", 403);
      userId = person;
    }

    const from = dayParam(searchParams.get("from"));
    const to = dayParam(searchParams.get("to"));
    const projectId = searchParams.get("project");
    const requisitionId = searchParams.get("requisition");
    const type = searchParams.get("type");
    const flag = searchParams.get("flag");
    const search = searchParams.get("q")?.trim();

    const conditions: Prisma.CrmDailyCostEntryWhereInput[] = [];
    if (search) conditions.push({ description: { contains: search, mode: "insensitive" } });
    if (projectId) conditions.push({ projectId: projectId === "none" ? null : projectId });
    if (requisitionId) conditions.push({ requisitionId: requisitionId === "none" ? null : requisitionId });
    if (type === "SPENT" || type === "RECEIVED") conditions.push({ direction: type });

    // The two things a manager scans this list for. Spend with no photo of
    // its receipt; and cash received against an invoice that accounting has
    // not receipted — the gap a float disappears into.
    let gaps: Map<string, ReceiptGap> | null = null;
    if (flag === "no-receipt") conditions.push({ direction: "SPENT", receiptUrl: null });
    if (flag === "not-receipted") {
      gaps = await receiptGaps(prisma, companyId);
      conditions.push({ direction: "RECEIVED", invoiceDocumentId: { in: [...gaps.keys()] } });
    }

    const where: Prisma.CrmDailyCostEntryWhereInput = {
      companyId,
      log: {
        ...(userId ? { userId } : {}),
        ...(from || to
          ? { logDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
          : {}),
      },
      ...(conditions.length ? { AND: conditions } : {}),
    };

    const [entries, total] = await Promise.all([
      prisma.crmDailyCostEntry.findMany({
        where,
        include: ENTRY_INCLUDE,
        orderBy: [{ log: { logDate: "desc" } }, { createdAt: "desc" }],
        skip,
        take: limit,
      }),
      prisma.crmDailyCostEntry.count({ where }),
    ]);

    // Only the invoices on this page are asked about, unless the whole gap
    // map was already read for the filter.
    const invoiceIds = [
      ...new Set(entries.map((entry) => entry.invoiceDocumentId).filter((id): id is string => Boolean(id))),
    ];
    const pageGaps =
      gaps ?? (invoiceIds.length ? await receiptGaps(prisma, companyId, { invoiceDocumentIds: invoiceIds }) : new Map());

    return successResponse({
      ...paginationResponse(
        entries.map((entry) => ({ ...entry, notReceipted: isNotReceipted(entry, pageGaps) })),
        total,
        page,
        limit,
      ),
      mayViewAll,
    });
  } catch (error) {
    console.error("[API] GET /api/v2/crm/cost-entries error:", error);
    return errorResponse("Failed to load the money");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { companyId } = session.user;

    const data = costEntrySchema.parse(await request.json());

    if (data.projectId) {
      const project = await prisma.crmProject.findFirst({
        where: { id: data.projectId, companyId },
        select: { id: true },
      });
      if (!project) return errorResponse("Project not found", 404);
    }

    // Money received against an invoice has to be this company's invoice —
    // not a quote, not a receipt, and not somebody else's.
    if (data.invoiceDocumentId) {
      const document = await prisma.crmLeadDocument.findFirst({
        where: { id: data.invoiceDocumentId, companyId, type: "INVOICE" },
        select: { id: true },
      });
      if (!document) return errorResponse("Invoice not found", 404);
    }

    // A line against a requisition is somebody reporting what they did with
    // money handed to them — so it has to be their own requisition, and one
    // still open to a report. An acquitted requisition's figure is settled;
    // a line added afterwards would make it disagree with its own lines.
    let projectId = data.projectId;
    if (data.requisitionId) {
      const requisition = await prisma.crmRequisition.findFirst({
        where: { id: data.requisitionId, companyId, requestedById: session.user.id },
        select: { id: true, status: true, projectId: true },
      });
      if (!requisition) return errorResponse("Requisition not found", 404);
      if (!canReport(requisition.status as RequisitionStatus)) {
        return errorResponse(
          requisition.status === "ACQUITTED"
            ? "This requisition has been accounted for. Its report is closed."
            : "Spend can be reported once the requisition is approved.",
          409,
        );
      }
      // The money was asked for against a project, so what it bought is that
      // project's cost unless the line says otherwise.
      if (projectId === undefined) projectId = requisition.projectId;
    }

    const entry = await prisma.$transaction((tx) =>
      addCostEntry(tx, { ...data, projectId, companyId, userId: session.user.id }),
    );

    // An entry that names a requisition posts nothing: that money was
    // expensed when it was disbursed, and posting it again would double the
    // cost. Best-effort, like every other posting call — the line is the thing
    // the person needs saved.
    try {
      await postCostEntry(companyId, entry, session.user.id);
    } catch (error) {
      console.error("[API] cost entry posting failed:", error);
    }

    const entries = await prisma.crmDailyCostEntry.findMany({
      where: { companyId, logId: entry.logId },
      select: { direction: true, amount: true, projectId: true, receiptUrl: true },
    });

    return successResponse({ entry, totals: dayTotals(entries) }, 201);
  } catch (error) {
    if (error instanceof CostEntryError) return errorResponse(error.message, 409);
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/v2/crm/cost-entries error:", error);
    return errorResponse("Failed to record the entry");
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { companyId } = session.user;

    const id = new URL(request.url).searchParams.get("id");
    if (!id) return errorResponse("Which entry?", 400);

    const entry = await prisma.crmDailyCostEntry.findFirst({
      where: { id, companyId },
      select: {
        id: true,
        log: { select: { userId: true, submittedAt: true } },
        requisition: { select: { status: true } },
      },
    });
    if (!entry) return errorResponse("Entry not found", 404);
    if (entry.log.userId !== session.user.id) {
      return errorResponse("You can only change your own money", 403);
    }
    if (entry.log.submittedAt) {
      return errorResponse("This day has been submitted and cannot be changed.", 409);
    }
    if (entry.requisition?.status === "ACQUITTED") {
      return errorResponse(
        "This line is part of a requisition that has been accounted for, so it stays.",
        409,
      );
    }

    await prisma.crmDailyCostEntry.delete({ where: { id } });
    return successResponse({ deleted: id });
  } catch (error) {
    console.error("[API] DELETE /api/v2/crm/cost-entries error:", error);
    return errorResponse("Failed to remove the entry");
  }
}
