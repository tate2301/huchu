import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  errorResponse,
  getPaginationParams,
  paginationResponse,
  successResponse,
  validateSession,
} from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { createCrmTask, CrmTaskRefused } from "@/lib/crm/create-task";
import { createTaskSchema, taskQueueWhere, type TaskQueue } from "@/lib/crm/tasks";

const QUEUES: TaskQueue[] = [
  "ALL",
  "MINE",
  "TODAY",
  "OVERDUE",
  "UPCOMING",
  "COMPLETED",
  "TEAM",
  "UNASSIGNED",
];

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = getPaginationParams(request);

    const requested = searchParams.get("queue");
    const queue = QUEUES.find((value) => value === requested) ?? "MINE";

    const where = {
      ...taskQueueWhere(queue, {
        companyId: session.user.companyId,
        userId: session.user.id,
      }),
      // A record page asks for just its own tasks.
      ...(searchParams.get("dealId") ? { dealId: searchParams.get("dealId")! } : {}),
      ...(searchParams.get("leadId") ? { leadId: searchParams.get("leadId")! } : {}),
      ...(searchParams.get("clientId") ? { clientId: searchParams.get("clientId")! } : {}),
      ...(searchParams.get("personId") ? { personId: searchParams.get("personId")! } : {}),
      ...(searchParams.get("siteId") ? { siteId: searchParams.get("siteId")! } : {}),
      // The register view filters by owner. `MINE` already pins the owner, so
      // this only ever narrows a queue that does not.
      ...(searchParams.get("assignedToId")
        ? searchParams.get("assignedToId") === "none"
          ? { assignedToId: null }
          : { assignedToId: searchParams.get("assignedToId")! }
        : {}),
    };

    const [tasks, total] = await Promise.all([
      prisma.crmTask.findMany({
        where,
        include: {
          assignedTo: { select: { id: true, name: true } },
          deal: { select: { id: true, dealNo: true, title: true } },
          lead: { select: { id: true, leadNo: true, title: true } },
          client: { select: { id: true, name: true } },
          person: { select: { id: true, fullName: true } },
        },
        orderBy: [{ dueAt: "asc" }, { priority: "desc" }],
        skip,
        take: limit,
      }),
      prisma.crmTask.count({ where }),
    ]);

    return successResponse(paginationResponse(tasks, total, page, limit));
  } catch (error) {
    console.error("[API] GET /api/v2/crm/tasks error:", error);
    return errorResponse("Failed to fetch tasks");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const data = createTaskSchema.parse(await request.json());
    const task = await createCrmTask(session, data);

    return successResponse(task, 201);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    if (error instanceof CrmTaskRefused) return errorResponse(error.message, error.status);
    console.error("[API] POST /api/v2/crm/tasks error:", error);
    return errorResponse("Failed to create the task");
  }
}
