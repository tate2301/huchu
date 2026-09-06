import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  errorResponse,
  getPaginationParams,
  paginationResponse,
  successResponse,
  validateSession,
} from "@corelithzw/platform/api-utils";
import { canUser, denialMessage } from "@corelithzw/module-crm/permissions";
import { prisma } from "@corelithzw/db/client";
import { createTaskSchema, taskQueueWhere, type TaskQueue } from "@corelithzw/module-crm/tasks";
import { isCompanyUser } from "../_helpers";

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
    const companyId = session.user.companyId;

    const data = createTaskSchema.parse(await request.json());

    if (!(await isCompanyUser(companyId, data.assignedToId))) {
      return errorResponse("Invalid assignee", 400);
    }
    // Putting work on somebody else's list is its own permission.
    if (
      data.assignedToId &&
      data.assignedToId !== session.user.id &&
      !(await canUser(session, "tasks.assign.others"))
    ) {
      return errorResponse(denialMessage("tasks.assign.others"), 403);
    }

    // Whatever the task is filed against has to be in this tenant.
    const checks: Array<[string, string | null | undefined, () => Promise<unknown>]> = [
      ["deal", data.dealId, () => prisma.crmDeal.findFirst({ where: { id: data.dealId!, companyId }, select: { id: true } })],
      ["lead", data.leadId, () => prisma.crmLead.findFirst({ where: { id: data.leadId!, companyId }, select: { id: true } })],
      ["company", data.clientId, () => prisma.crmClient.findFirst({ where: { id: data.clientId!, companyId }, select: { id: true } })],
      ["person", data.personId, () => prisma.crmPerson.findFirst({ where: { id: data.personId!, companyId }, select: { id: true } })],
      ["site", data.siteId, () => prisma.crmSite.findFirst({ where: { id: data.siteId!, companyId }, select: { id: true } })],
    ];
    for (const [label, id, check] of checks) {
      if (!id) continue;
      if (!(await check())) return errorResponse(`Invalid ${label}`, 400);
    }

    const task = await prisma.crmTask.create({
      data: {
        companyId,
        title: data.title,
        description: data.description ?? undefined,
        type: data.type ?? "GENERAL",
        priority: data.priority ?? "NORMAL",
        dueAt: new Date(data.dueAt),
        hasDueTime: data.hasDueTime ?? false,
        remindAt: data.remindAt ? new Date(data.remindAt) : undefined,
        // An unassigned task is a task nobody is doing, so it defaults to the
        // person creating it.
        assignedToId: data.assignedToId ?? session.user.id,
        createdById: session.user.id,
        leadId: data.leadId ?? undefined,
        dealId: data.dealId ?? undefined,
        clientId: data.clientId ?? undefined,
        personId: data.personId ?? undefined,
        siteId: data.siteId ?? undefined,
        recurrence: data.recurrence ?? "NONE",
        recurrenceInterval: data.recurrenceInterval ?? 1,
      },
      include: { assignedTo: { select: { id: true, name: true } } },
    });

    return successResponse(task, 201);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    console.error("[API] POST /api/v2/crm/tasks error:", error);
    return errorResponse("Failed to create the task");
  }
}
