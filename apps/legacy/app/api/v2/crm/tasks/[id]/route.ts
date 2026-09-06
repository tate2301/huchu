import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { canEditRecord } from "@corelithzw/module-crm/permissions";
import {
  CRM_TASK_OUTCOME_LABELS,
  nextOccurrence,
  outcomesForType,
  requiresOutcome,
  suggestsFollowUp,
} from "@corelithzw/module-crm/tasks";
import { isCompanyUser } from "../../_helpers";

const updateTaskSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(4000).nullable().optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
  dueAt: z.string().datetime().optional(),
  hasDueTime: z.boolean().optional(),
  remindAt: z.string().datetime().nullable().optional(),
  assignedToId: z.string().uuid().nullable().optional(),
  status: z.enum(["OPEN", "COMPLETED", "CANCELLED"]).optional(),
  outcome: z
    .enum(Object.keys(CRM_TASK_OUTCOME_LABELS) as [string, ...string[]])
    .nullable()
    .optional(),
  outcomeNotes: z.string().trim().max(2000).nullable().optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;
    const { id } = await params;

    const existing = await prisma.crmTask.findFirst({
      where: { id, companyId },
      select: {
        id: true,
        type: true,
        status: true,
        dueAt: true,
        assignedToId: true,
        recurrence: true,
        recurrenceInterval: true,
        title: true,
        description: true,
        priority: true,
        hasDueTime: true,
        leadId: true,
        dealId: true,
        clientId: true,
        personId: true,
        siteId: true,
      },
    });
    if (!existing) return errorResponse("Task not found", 404);
    if (!await canEditRecord(session, existing.assignedToId)) {
      return errorResponse("You can only change tasks assigned to you", 403);
    }

    const data = updateTaskSchema.parse(await request.json());
    if (!(await isCompanyUser(companyId, data.assignedToId))) {
      return errorResponse("Invalid assignee", 400);
    }

    const completing = data.status === "COMPLETED" && existing.status !== "COMPLETED";

    // A call task that closes without saying what happened teaches nobody
    // anything, so the outcome is required where the type has one.
    if (completing && requiresOutcome(existing.type)) {
      const allowed = outcomesForType(existing.type);
      if (!data.outcome) {
        return NextResponse.json(
          {
            error: "This task needs an outcome",
            code: "OUTCOME_REQUIRED",
            outcomes: allowed.map((value) => ({ value, label: CRM_TASK_OUTCOME_LABELS[value] })),
          },
          { status: 409 },
        );
      }
      if (!allowed.includes(data.outcome as (typeof allowed)[number])) {
        return errorResponse(`"${data.outcome}" isn't an outcome for this kind of task`, 400);
      }
    }

    const now = new Date();
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.crmTask.update({
        where: { id },
        data: {
          title: data.title,
          description: data.description,
          priority: data.priority,
          dueAt: data.dueAt ? new Date(data.dueAt) : undefined,
          hasDueTime: data.hasDueTime,
          remindAt: data.remindAt ? new Date(data.remindAt) : data.remindAt,
          assignedToId: data.assignedToId,
          status: data.status,
          outcome: (data.outcome ?? undefined) as never,
          outcomeNotes: data.outcomeNotes,
          completedAt: completing ? now : data.status === "OPEN" ? null : undefined,
        },
        include: { assignedTo: { select: { id: true, name: true } } },
      });

      // A recurring task spawns its next occurrence on completion rather than
      // on a schedule, so a task nobody finished never silently piles up.
      let recurred: { id: string; dueAt: Date } | null = null;
      if (completing && existing.recurrence !== "NONE") {
        const nextDue = nextOccurrence(
          existing.dueAt,
          existing.recurrence,
          existing.recurrenceInterval,
        );
        if (nextDue) {
          const created = await tx.crmTask.create({
            data: {
              companyId,
              title: existing.title,
              description: existing.description,
              type: existing.type,
              priority: existing.priority,
              dueAt: nextDue,
              hasDueTime: existing.hasDueTime,
              assignedToId: existing.assignedToId,
              createdById: session.user.id,
              leadId: existing.leadId,
              dealId: existing.dealId,
              clientId: existing.clientId,
              personId: existing.personId,
              siteId: existing.siteId,
              recurrence: existing.recurrence,
              recurrenceInterval: existing.recurrenceInterval,
              recurredFromId: existing.id,
            },
            select: { id: true, dueAt: true },
          });
          recurred = created;
        }
      }

      // Completing a task is a real event on the record's timeline.
      if (completing) {
        const outcomeLabel = data.outcome
          ? CRM_TASK_OUTCOME_LABELS[data.outcome as keyof typeof CRM_TASK_OUTCOME_LABELS]
          : null;
        await tx.crmActivity.create({
          data: {
            companyId,
            type: "SYSTEM",
            leadId: existing.leadId,
            dealId: existing.dealId,
            clientId: existing.clientId,
            personId: existing.personId,
            subject: outcomeLabel
              ? `${existing.title} — ${outcomeLabel.toLowerCase()}`
              : `Task completed: ${existing.title}`,
            body: data.outcomeNotes ?? undefined,
            metadata: { taskId: id, outcome: data.outcome ?? null },
            createdById: session.user.id,
            occurredAt: now,
          },
        });
      }

      return { updated, recurred };
    });

    return successResponse({
      ...result.updated,
      recurredTask: result.recurred,
      // The caller offers to book the next step when the outcome says the
      // conversation isn't finished.
      suggestsFollowUp: completing && suggestsFollowUp(data.outcome as never),
    });
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    console.error("[API] PATCH /api/v2/crm/tasks/[id] error:", error);
    return errorResponse("Failed to update the task");
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;

    const existing = await prisma.crmTask.findFirst({
      where: { id, companyId: session.user.companyId },
      select: { id: true, assignedToId: true },
    });
    if (!existing) return errorResponse("Task not found", 404);
    if (!await canEditRecord(session, existing.assignedToId)) {
      return errorResponse("You can only delete tasks assigned to you", 403);
    }

    await prisma.crmTask.delete({ where: { id } });
    return successResponse({ id });
  } catch (error) {
    console.error("[API] DELETE /api/v2/crm/tasks/[id] error:", error);
    return errorResponse("Failed to delete the task");
  }
}
