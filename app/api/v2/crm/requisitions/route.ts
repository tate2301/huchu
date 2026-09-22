/**
 * Requisitions: raising one, and the queues people read.
 *
 * Three queues, because three different people open this page. A rep wants
 * theirs. An approver wants what is waiting on them. Whoever holds the cash
 * wants what has been approved but not yet paid, and what is out and not yet
 * accounted for.
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
import { reserveIdentifier } from "@/lib/id-generator";
import { createRequisitionSchema } from "@/lib/crm/requisitions";
import { requireCrmCapability } from "../_helpers";
import { notifyApprovers } from "./_shared";

const QUEUES = ["MINE", "AWAITING_DECISION", "APPROVED", "OUTSTANDING", "ALL"] as const;
type Queue = (typeof QUEUES)[number];

function queueWhere(queue: Queue, companyId: string, userId: string): Prisma.CrmRequisitionWhereInput {
  switch (queue) {
    case "MINE":
      return { companyId, requestedById: userId };
    case "AWAITING_DECISION":
      return { companyId, status: "SUBMITTED" };
    case "APPROVED":
      // Approved and not yet paid: the claim on this week's bank balance.
      return { companyId, status: "APPROVED" };
    case "OUTSTANDING":
      return { companyId, status: "DISBURSED" };
    default:
      return { companyId };
  }
}

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { companyId } = session.user;

    const { searchParams } = new URL(request.url);
    const requested = searchParams.get("queue") as Queue | null;
    const queue: Queue = requested && QUEUES.includes(requested) ? requested : "MINE";
    const projectId = searchParams.get("projectId");
    const { page, limit, skip } = getPaginationParams(request);

    // A rep sees their own requests whatever queue they ask for. Somebody's
    // pay is in these figures, and the approval queue is not a rep's business.
    const [mayApprove, mayDisburse] = await Promise.all([
      requireCrmCapability(session, "money.approve"),
      requireCrmCapability(session, "money.disburse"),
    ]);
    const canSeeOthers = mayApprove || mayDisburse;

    const where: Prisma.CrmRequisitionWhereInput = {
      ...queueWhere(canSeeOthers ? queue : "MINE", companyId, session.user.id),
      ...(projectId ? { projectId } : {}),
    };

    const [requisitions, total, counts] = await Promise.all([
      prisma.crmRequisition.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          project: { select: { id: true, name: true, projectNo: true } },
          requestedBy: { select: { id: true, name: true } },
          approvedBy: { select: { id: true, name: true } },
        },
      }),
      prisma.crmRequisition.count({ where }),
      prisma.crmRequisition.groupBy({
        by: ["status"],
        where: canSeeOthers ? { companyId } : { companyId, requestedById: session.user.id },
        _count: { _all: true },
      }),
    ]);

    return successResponse({
      ...paginationResponse(requisitions, total, page, limit),
      counts: Object.fromEntries(counts.map((row) => [row.status, row._count._all])),
      permissions: { mayApprove, mayDisburse },
    });
  } catch (error) {
    console.error("[API] GET /api/v2/crm/requisitions error:", error);
    return errorResponse("Failed to load requisitions");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { companyId } = session.user;

    const data = createRequisitionSchema.parse(await request.json());

    if (data.projectId) {
      const project = await prisma.crmProject.findFirst({
        where: { id: data.projectId, companyId },
        select: { id: true },
      });
      if (!project) return errorResponse("Project not found", 404);
    }

    const requisition = await prisma.$transaction(async (tx) => {
      const requisitionNo = await reserveIdentifier(tx, {
        companyId,
        entity: "CRM_REQUISITION",
      });
      return tx.crmRequisition.create({
        data: {
          companyId,
          requisitionNo,
          category: data.category,
          purpose: data.purpose,
          notes: data.notes ?? null,
          projectId: data.projectId ?? null,
          amount: data.amount,
          currency: data.currency,
          requestedById: session.user.id,
          neededBy: data.neededBy ?? null,
          ...(data.submit ? { status: "SUBMITTED" as const, submittedAt: new Date() } : {}),
        },
      });
    });

    if (requisition.status === "SUBMITTED") {
      await notifyApprovers(companyId, session.user.id, requisition);
    }

    return successResponse({ requisition }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/v2/crm/requisitions error:", error);
    return errorResponse("Failed to raise the requisition");
  }
}
