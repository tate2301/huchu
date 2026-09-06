/**
 * Running automation rules against the database.
 *
 * The engine's decisions live in `automation.ts`; this file only carries them
 * out. It never throws into the caller: a rule failing must not stop a lead
 * being created, so failures are logged as runs and the request carries on.
 */
import type { CrmAutomationTrigger, CrmFieldEntity, Prisma } from "@corelithzw/db";

import { prisma } from "@corelithzw/db/client";
import { emitCrmNotification } from "./notifications";
import {
  dueDateFromDays,
  isSettableField,
  matchesConditions,
  matchesTrigger,
  type AutomationAction,
  type AutomationCondition,
  type TriggerConfig,
} from "./automation";
import { autoAssignLead } from "./auto-assign";

export type AutomationEvent = {
  companyId: string;
  trigger: CrmAutomationTrigger;
  entity: CrmFieldEntity;
  recordId: string;
  /** The record as it now stands, for conditions to read. */
  record: Record<string, unknown>;
  /** The stage it just landed on, for stage-scoped rules. */
  stage?: string | null;
  /** Who caused it, so a rule doesn't notify the person who did the thing. */
  actorId?: string | null;
};

type ActionOutcome = { type: string; ok: boolean; detail?: string };

const RECORD_COLUMN: Partial<Record<CrmFieldEntity, string>> = {
  LEAD: "leadId",
  DEAL: "dealId",
  COMPANY: "clientId",
  PERSON: "personId",
  SITE: "siteId",
};

function recordPath(entity: CrmFieldEntity, id: string): string {
  switch (entity) {
    case "DEAL":
      return `/crm/deals/${id}`;
    case "COMPANY":
      return `/crm/companies/${id}`;
    case "PERSON":
      return `/crm/people/${id}`;
    case "SITE":
      return `/crm/sites/${id}`;
    default:
      return `/crm/leads/${id}`;
  }
}

async function runAction(
  action: AutomationAction,
  event: AutomationEvent,
): Promise<ActionOutcome> {
  const { companyId, entity, recordId } = event;
  const ownerId = (event.record.assignedToId as string | null | undefined) ?? null;
  const column = RECORD_COLUMN[entity];

  switch (action.type) {
    case "CREATE_TASK": {
      if (!column) return { type: action.type, ok: false, detail: "Unsupported record type" };
      await prisma.crmTask.create({
        data: {
          companyId,
          title: action.title,
          type: (action.taskType as never) ?? "GENERAL",
          dueAt: dueDateFromDays(action.dueInDays),
          hasDueTime: false,
          // A rule that doesn't name an assignee gives the task to whoever
          // owns the record, not to nobody.
          assignedToId: action.assignedToId ?? ownerId,
          [column]: recordId,
        } as Prisma.CrmTaskUncheckedCreateInput,
      });
      return { type: action.type, ok: true };
    }

    case "ASSIGN_OWNER": {
      let assignedToId = action.assignedToId;
      if (!assignedToId) {
        const decision = await autoAssignLead(companyId);
        assignedToId = decision.userId;
      }
      if (!assignedToId) return { type: action.type, ok: false, detail: "Nobody to assign to" };

      if (entity === "LEAD") {
        await prisma.crmLead.update({ where: { id: recordId }, data: { assignedToId } });
      } else if (entity === "DEAL") {
        await prisma.crmDeal.update({ where: { id: recordId }, data: { assignedToId } });
      } else {
        return { type: action.type, ok: false, detail: "Unsupported record type" };
      }
      return { type: action.type, ok: true, detail: assignedToId };
    }

    case "NOTIFY": {
      // A rule notifying the person who just did the thing is noise, so the
      // actor is dropped from the list.
      const recipients = (action.recipientIds.length ? action.recipientIds : [ownerId])
        .filter((id): id is string => Boolean(id))
        .filter((id) => id !== event.actorId);
      if (recipients.length === 0) return { type: action.type, ok: true, detail: "No recipients" };

      await emitCrmNotification({
        companyId,
        recipientIds: recipients,
        type: "CRM_LEAD_ASSIGNED",
        title: action.message,
        summary: action.message,
        leadId: entity === "LEAD" ? recordId : undefined,
        entityType: entity === "LEAD" ? "CRM_LEAD" : undefined,
        entityId: entity === "LEAD" ? recordId : undefined,
        viewPath: recordPath(entity, recordId),
      });
      return { type: action.type, ok: true };
    }

    case "ADD_TAG": {
      // Only records that actually carry tags.
      if (entity === "COMPANY") {
        const current = await prisma.crmClient.findUnique({
          where: { id: recordId },
          select: { tags: true },
        });
        if (!current) return { type: action.type, ok: false, detail: "Record not found" };
        if (current.tags.includes(action.tag)) return { type: action.type, ok: true };
        await prisma.crmClient.update({
          where: { id: recordId },
          data: { tags: [...current.tags, action.tag] },
        });
        return { type: action.type, ok: true };
      }
      if (entity === "PERSON") {
        const current = await prisma.crmPerson.findUnique({
          where: { id: recordId },
          select: { tags: true },
        });
        if (!current) return { type: action.type, ok: false, detail: "Record not found" };
        if (current.tags.includes(action.tag)) return { type: action.type, ok: true };
        await prisma.crmPerson.update({
          where: { id: recordId },
          data: { tags: [...current.tags, action.tag] },
        });
        return { type: action.type, ok: true };
      }
      return { type: action.type, ok: false, detail: "That record type has no tags" };
    }

    case "SET_FIELD": {
      // A whitelist, not a general field writer: letting a rule set companyId
      // would move a record between tenants.
      if (!isSettableField(entity, action.field)) {
        return { type: action.type, ok: false, detail: `${action.field} can't be set by a rule` };
      }
      const data = { [action.field]: action.value } as Record<string, unknown>;
      if (entity === "LEAD") {
        await prisma.crmLead.update({ where: { id: recordId }, data });
      } else if (entity === "DEAL") {
        await prisma.crmDeal.update({ where: { id: recordId }, data });
      } else {
        return { type: action.type, ok: false, detail: "Unsupported record type" };
      }
      return { type: action.type, ok: true };
    }

    default:
      return { type: "UNKNOWN", ok: false, detail: "Unknown action" };
  }
}

/**
 * Run every enabled rule that matches this event.
 *
 * Deliberately fire-and-forget from the caller's point of view: a rule that
 * fails must not fail the request that triggered it. Every firing is recorded
 * so "why did this get assigned to me?" has an answer, and so a rule that is
 * quietly failing is visible rather than mysterious.
 */
export async function runAutomations(event: AutomationEvent): Promise<void> {
  try {
    const rules = await prisma.crmAutomation.findMany({
      where: { companyId: event.companyId, trigger: event.trigger, isEnabled: true },
      select: {
        id: true,
        trigger: true,
        triggerConfig: true,
        conditions: true,
        actions: true,
      },
    });

    for (const rule of rules) {
      const triggerConfig = (rule.triggerConfig ?? null) as TriggerConfig | null;
      if (!matchesTrigger({ trigger: rule.trigger, triggerConfig }, event)) continue;

      const conditions = (rule.conditions ?? []) as AutomationCondition[];
      if (!matchesConditions(event.record, conditions)) continue;

      const actions = (rule.actions ?? []) as AutomationAction[];
      const outcomes: ActionOutcome[] = [];
      // Measured rather than estimated: "this rule is slow" should be a fact
      // somebody can check against the others, not a feeling about the rule
      // that happens to run when the page is busy.
      const startedAt = Date.now();

      for (const action of actions) {
        try {
          outcomes.push(await runAction(action, event));
        } catch (error) {
          outcomes.push({
            type: action.type,
            ok: false,
            detail: error instanceof Error ? error.message : "Action failed",
          });
        }
      }

      const succeeded = outcomes.filter((outcome) => outcome.ok).length;
      const status =
        succeeded === outcomes.length ? "SUCCEEDED" : succeeded === 0 ? "FAILED" : "PARTIAL";

      await prisma.$transaction([
        prisma.crmAutomationRun.create({
          data: {
            companyId: event.companyId,
            automationId: rule.id,
            entity: event.entity,
            recordId: event.recordId,
            status,
            result: outcomes as unknown as Prisma.InputJsonValue,
            durationMs: Date.now() - startedAt,
            actionCount: outcomes.length,
          },
        }),
        prisma.crmAutomation.update({
          where: { id: rule.id },
          data: { runCount: { increment: 1 }, lastRunAt: new Date() },
        }),
      ]);
    }
  } catch (error) {
    console.error("[CRM] runAutomations failed:", error);
  }
}
