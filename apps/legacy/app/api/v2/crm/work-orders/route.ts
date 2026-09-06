import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@corelithzw/db";

import {
  errorResponse,
  getPaginationParams,
  paginationResponse,
  successResponse,
  validateSession,
} from "@/lib/api-utils";
import { prisma } from "@corelithzw/db/client";
import { reserveIdentifier } from "@/lib/id-generator";
import {
  completionPercent,
  createWorkOrderSchema,
  isOverdueToStart,
  parseWorkOrderStatuses,
  quoteLinesToWorkItems,
  readInvoiceLink,
  workOrderCountsFromGroups,
  type WorkOrderCounts,
  type WorkOrderQueue,
} from "@/lib/crm/work-orders";
import { isCompanyUser } from "../_helpers";
import { jobRecordRefs, recordJobActivity } from "./_shared";

const QUEUES: WorkOrderQueue[] = [
  "TODAY",
  "SCHEDULED",
  "IN_PROGRESS",
  "BLOCKED",
  "MINE",
  "DONE",
];

function queueWhere(
  queue: WorkOrderQueue,
  companyId: string,
  userId: string,
): Prisma.CrmWorkOrderWhereInput {
  const now = new Date();
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);

  switch (queue) {
    case "TODAY":
      // Anything that should already have started counts as today's problem,
      // the same way an overdue task does.
      return {
        companyId,
        status: { in: ["SCHEDULED", "IN_PROGRESS"] },
        scheduledStart: { lte: endOfDay },
      };
    case "SCHEDULED":
      return { companyId, status: "SCHEDULED" };
    case "IN_PROGRESS":
      return { companyId, status: "IN_PROGRESS" };
    case "BLOCKED":
      return { companyId, status: "BLOCKED" };
    case "MINE":
      return {
        companyId,
        assignedToId: userId,
        status: { in: ["SCHEDULED", "IN_PROGRESS", "BLOCKED"] },
      };
    case "DONE":
      return { companyId, status: "COMPLETED" };
    default:
      return { companyId };
  }
}

/** How many rows the summary counts before it stops asking. */

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;

    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = getPaginationParams(request);
    const requested = searchParams.get("queue");
    const queue = QUEUES.find((value) => value === requested);

    const dealId = searchParams.get("dealId");
    const siteId = searchParams.get("siteId");
    const clientId = searchParams.get("clientId");
    const scoped = Boolean(dealId || siteId || clientId);

    // Asked for one record's jobs, answer with all of them. The queues are for
    // browsing the day's work; applying TODAY by default to a deal's Jobs tab
    // is what made a job vanish the moment it was raised without a slot.
    const record: Prisma.CrmWorkOrderWhereInput = {
      ...(dealId ? { dealId } : {}),
      ...(siteId ? { siteId } : {}),
      ...(clientId ? { clientId } : {}),
    };

    // The register's own narrowing, done here rather than over whatever one
    // page of rows happened to come back — a search that only finds what page
    // one already held is a search that lies about the register's contents.
    const q = searchParams.get("q")?.trim();
    const statuses = parseWorkOrderStatuses(searchParams.get("status"));
    const assignedToId = searchParams.get("assignedToId")?.trim();
    const narrow: Prisma.CrmWorkOrderWhereInput = {
      ...(q
        ? {
            OR: [
              { workOrderNo: { contains: q, mode: "insensitive" } },
              { title: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(statuses.length ? { status: { in: statuses } } : {}),
      // "unassigned" is a real answer to "whose is it?", and an id nobody has
      // is not a way to ask it.
      ...(assignedToId ? { assignedToId: assignedToId === "none" ? null : assignedToId } : {}),
    };
    const narrowed = Object.keys(narrow).length > 0;

    // A narrowing is a question about the whole register, so it drops the
    // TODAY default the same way naming a record does — searching a job number
    // and being told there are no jobs, because that one isn't today's, is the
    // filter appearing to be broken.
    const base: Prisma.CrmWorkOrderWhereInput = queue
      ? queueWhere(queue, companyId, session.user.id)
      : scoped || narrowed
        ? { companyId }
        : queueWhere("TODAY", companyId, session.user.id);

    // `AND` rather than a spread: a queue already carries a `status` and MINE
    // an `assignedToId`, and merging by key would let the filter silently
    // widen the queue it is meant to be narrowing.
    const where: Prisma.CrmWorkOrderWhereInput = {
      ...base,
      ...record,
      ...(narrowed ? { AND: [narrow] } : {}),
    };

    const [orders, total] = await Promise.all([
      prisma.crmWorkOrder.findMany({
        where,
        include: {
          assignedTo: { select: { id: true, name: true } },
          client: { select: { id: true, name: true } },
          site: { select: { id: true, name: true, addressLine: true } },
          deal: { select: { id: true, dealNo: true, title: true } },
          items: { orderBy: { position: "asc" } },
        },
        orderBy: [{ scheduledStart: "asc" }, { createdAt: "desc" }],
        skip,
        take: limit,
      }),
      prisma.crmWorkOrder.count({ where }),
    ]);

    const now = new Date();
    const rows = orders.map((order) => ({
      ...order,
      // Everything a compact row shows without the caller re-deriving it: the
      // list on a record page is a strip, not a table, and it has no business
      // knowing how progress is measured.
      completionPercent: completionPercent(order.items),
      itemsDone: order.items.filter((item) => item.completedQuantity >= item.quantity).length,
      itemCount: order.items.length,
      isOverdue: isOverdueToStart(order, now),
      invoice: readInvoiceLink(order.customFields),
    }));

    // A tab badge wants one number and shouldn't pay for a second request to
    // get it. Only computed where something asked for it, because it is a
    // second read of the same rows.
    let summary: WorkOrderCounts | undefined;
    if (scoped || searchParams.get("summary") === "true") {
      const summaryWhere = scoped ? { companyId, ...record } : where;
      // Counted in the database rather than off a page of rows. Reading the
      // tallies from a capped `findMany` meant any customer past the cap was
      // permanently undercounted — and because the badge is what says a job is
      // blocked or late, an urgent one could sit past the edge unseen.
      const [groups, overdue] = await Promise.all([
        prisma.crmWorkOrder.groupBy({
          by: ["status"],
          where: summaryWhere,
          _count: { _all: true },
        }),
        // The same test `isOverdueToStart` makes, asked of the database:
        // booked to start, and that time has been and gone.
        prisma.crmWorkOrder.count({
          where: { ...summaryWhere, status: "SCHEDULED", scheduledStart: { lt: now } },
        }),
      ]);
      summary = workOrderCountsFromGroups(
        groups.map((group) => ({ status: group.status, count: group._count._all })),
        overdue,
      );
    }

    return successResponse({
      ...paginationResponse(rows, total, page, limit),
      ...(summary ? { summary } : {}),
    });
  } catch (error) {
    console.error("[API] GET /api/v2/crm/work-orders error:", error);
    return errorResponse("Failed to fetch work orders");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;

    const data = createWorkOrderSchema.parse(await request.json());

    if (!(await isCompanyUser(companyId, data.assignedToId))) {
      return errorResponse("Invalid assignee", 400);
    }
    for (const crewId of data.crewIds ?? []) {
      if (!(await isCompanyUser(companyId, crewId))) {
        return errorResponse("A crew member isn't in this company", 400);
      }
    }

    // Everything it hangs off has to be in this tenant. The deal and the site
    // are read for their company as well as for their existence, so a job
    // raised against only one of them still lands on the company's record.
    const deal = data.dealId
      ? await prisma.crmDeal.findFirst({
          where: { id: data.dealId, companyId },
          select: { id: true, clientId: true },
        })
      : null;
    if (data.dealId && !deal) return errorResponse("Invalid deal", 400);

    const site = data.siteId
      ? await prisma.crmSite.findFirst({
          where: { id: data.siteId, companyId },
          select: { id: true, clientId: true },
        })
      : null;
    if (data.siteId && !site) return errorResponse("Invalid site", 400);

    if (data.clientId) {
      const client = await prisma.crmClient.findFirst({
        where: { id: data.clientId, companyId },
        select: { id: true },
      });
      if (!client) return errorResponse("Invalid company", 400);
    }

    // The checklist can be lifted from the quote that was won rather than
    // retyped, which is where transcription errors come from.
    let items = data.items ?? [];
    if (data.documentId && items.length === 0) {
      const document = await prisma.crmLeadDocument.findFirst({
        where: { id: data.documentId, companyId },
        select: {
          id: true,
          quotation: { select: { lines: { select: { description: true, quantity: true } } } },
        },
      });
      if (!document) return errorResponse("Invalid document", 400);
      items = quoteLinesToWorkItems(document.quotation?.lines ?? []);
    }

    const workOrderNo = await reserveIdentifier(prisma, {
      companyId,
      entity: "CRM_WORK_ORDER",
    });

    const order = await prisma.crmWorkOrder.create({
      data: {
        companyId,
        workOrderNo,
        title: data.title,
        description: data.description ?? undefined,
        // A job with a slot booked is scheduled; without one it's still a plan.
        status: data.scheduledStart ? "SCHEDULED" : "DRAFT",
        priority: data.priority ?? "NORMAL",
        dealId: data.dealId ?? undefined,
        // Backfilled from whichever record does know the customer, so the
        // job lands on the company's Jobs tab as well as on its timeline —
        // the GET filters on this column, and `jobRecordRefs` was already
        // deriving the same answer for the activity trail.
        clientId: data.clientId ?? deal?.clientId ?? site?.clientId ?? undefined,
        siteId: data.siteId ?? undefined,
        documentId: data.documentId ?? undefined,
        scheduledStart: data.scheduledStart ? new Date(data.scheduledStart) : undefined,
        scheduledEnd: data.scheduledEnd ? new Date(data.scheduledEnd) : undefined,
        assignedToId: data.assignedToId ?? undefined,
        crewIds: data.crewIds ?? [],
        addressLine: data.addressLine ?? undefined,
        accessNotes: data.accessNotes ?? undefined,
        contactName: data.contactName ?? undefined,
        contactPhone: data.contactPhone ?? undefined,
        createdById: session.user.id,
        items: items.length
          ? {
              create: items.map((item, index) => ({
                companyId,
                position: index,
                description: item.description,
                quantity: item.quantity,
                unit: "unit" in item ? (item.unit ?? undefined) : undefined,
                productId:
                  "productId" in item ? (item.productId ?? undefined) : undefined,
                notes: "notes" in item ? (item.notes ?? undefined) : undefined,
              })),
            }
          : undefined,
      },
      include: {
        items: { orderBy: { position: "asc" } },
        assignedTo: { select: { id: true, name: true } },
      },
    });

    // On the deal, on the company, and carrying the site — a job raised against
    // a site alone used to leave no trace anywhere, which is most of why
    // nothing appeared to happen after somebody raised one.
    await recordJobActivity(prisma, {
      companyId,
      userId: session.user.id,
      job: order,
      refs: jobRecordRefs({ ...order, deal, site }),
      subject: `Work order ${workOrderNo} raised`,
      metadata: { status: order.status },
    });

    return successResponse(order, 201);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    console.error("[API] POST /api/v2/crm/work-orders error:", error);
    return errorResponse("Failed to create the work order");
  }
}
