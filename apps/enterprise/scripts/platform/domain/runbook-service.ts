import { prisma } from "../prisma";
import type {
  ExecuteRunbookInput,
  ListRunbookExecutionsInput,
  RiskLevel,
  RunbookDefinitionRecord,
  RunbookExecutionRecord,
  UpsertRunbookInput,
} from "../types";
import { appendAuditEvent } from "./audit-ledger";
import { normalizeEnum } from "./helpers";
import { enforceContract } from "./contract-service";
import { expireSupportSessions } from "./support-service";

function normalizeRisk(value?: string): RiskLevel {
  if (!value) return "LOW";
  return normalizeEnum(value, "risk level", ["LOW", "MEDIUM", "HIGH"]);
}

function mapDefinition(row: {
  id: string;
  name: string;
  companyId: string | null;
  actionType: string;
  schedule: string | null;
  enabled: boolean;
  riskLevel: string;
  inputJson: string | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}): RunbookDefinitionRecord {
  return {
    id: row.id,
    name: row.name,
    companyId: row.companyId,
    actionType: row.actionType,
    schedule: row.schedule,
    enabled: row.enabled,
    riskLevel: row.riskLevel as RiskLevel,
    inputJson: row.inputJson,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapExecution(row: {
  id: string;
  runbookId: string;
  companyId: string | null;
  status: string;
  dryRun: boolean;
  startedAt: Date;
  finishedAt: Date | null;
  resultJson: string | null;
  errorJson: string | null;
  createdAt: Date;
  runbook?: { name: string } | null;
}): RunbookExecutionRecord {
  return {
    id: row.id,
    runbookId: row.runbookId,
    runbookName: row.runbook?.name ?? null,
    companyId: row.companyId,
    status: row.status as RunbookExecutionRecord["status"],
    dryRun: row.dryRun,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
    resultJson: row.resultJson,
    errorJson: row.errorJson,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listRunbookDefinitions(companyId?: string): Promise<RunbookDefinitionRecord[]> {
  const rows = await prisma.runbookDefinition.findMany({
    where: companyId ? { companyId } : {},
    orderBy: [{ createdAt: "desc" }],
    take: 200,
  });
  return rows.map(mapDefinition);
}

export async function upsertRunbookDefinition(input: UpsertRunbookInput): Promise<RunbookDefinitionRecord> {
  const payload = {
    name: String(input.name || "").trim(),
    companyId: input.companyId ?? null,
    actionType: String(input.actionType || "").trim(),
    schedule: input.schedule?.trim() || null,
    enabled: input.enabled ?? true,
    riskLevel: normalizeRisk(input.riskLevel),
    inputJson: input.inputJson ?? null,
    createdBy: input.createdBy ?? null,
  };
  if (!payload.name) throw new Error("Runbook name is required.");
  if (!payload.actionType) throw new Error("Runbook actionType is required.");

  const row = input.id
    ? await prisma.runbookDefinition.update({
        where: { id: input.id },
        data: payload,
      })
    : await prisma.runbookDefinition.create({ data: payload });

  await appendAuditEvent({
    actor: input.createdBy ?? "system",
    action: input.id ? "RUNBOOK_UPDATED" : "RUNBOOK_CREATED",
    entityType: "runbook",
    entityId: row.id,
    companyId: row.companyId,
    reason: `${input.id ? "Updated" : "Created"} runbook ${row.name}`,
    after: mapDefinition(row),
  });
  return mapDefinition(row);
}

export async function listRunbookExecutions(input?: ListRunbookExecutionsInput): Promise<RunbookExecutionRecord[]> {
  const rows = await prisma.runbookExecution.findMany({
    where: {
      ...(input?.runbookId ? { runbookId: input.runbookId } : {}),
      ...(input?.companyId ? { companyId: input.companyId } : {}),
    },
    include: { runbook: { select: { name: true } } },
    orderBy: [{ createdAt: "desc" }],
    take: input?.limit ?? 100,
  });
  return rows.map(mapExecution);
}

export async function setRunbookEnabled(id: string, enabled: boolean, actor: string): Promise<RunbookDefinitionRecord> {
  const row = await prisma.runbookDefinition.update({ where: { id }, data: { enabled } });
  await appendAuditEvent({
    actor,
    action: enabled ? "RUNBOOK_ENABLED" : "RUNBOOK_DISABLED",
    entityType: "runbook",
    entityId: id,
    companyId: row.companyId,
    reason: `${enabled ? "Enabled" : "Disabled"} runbook ${row.name}`,
    after: mapDefinition(row),
  });
  return mapDefinition(row);
}

export async function executeRunbook(input: ExecuteRunbookInput): Promise<RunbookExecutionRecord> {
  const runbook = await prisma.runbookDefinition.findUnique({ where: { id: input.runbookId } });
  if (!runbook) throw new Error(`Runbook not found: ${input.runbookId}`);
  if (!runbook.enabled) throw new Error(`Runbook ${runbook.name} is disabled.`);

  const execution = await prisma.runbookExecution.create({
    data: {
      runbookId: runbook.id,
      companyId: runbook.companyId,
      status: "RUNNING",
      dryRun: Boolean(input.dryRun),
      startedAt: new Date(),
    },
    include: { runbook: { select: { name: true } } },
  });

  try {
    let resultPayload: unknown = {
      actionType: runbook.actionType,
      dryRun: Boolean(input.dryRun),
      message: "No-op action executed.",
    };

    if (!input.dryRun) {
      if (runbook.actionType === "support.expire-sessions") {
        resultPayload = await expireSupportSessions();
      } else if (runbook.actionType === "contract.enforce") {
        if (!runbook.companyId) throw new Error("Runbook action contract.enforce requires companyId.");
        const result = await enforceContract({
          companyId: runbook.companyId,
          actor: input.actor,
          reason: `Runbook ${runbook.name}`,
        });
        resultPayload = result;
      }
    }

    const row = await prisma.runbookExecution.update({
      where: { id: execution.id },
      data: {
        status: "SUCCESS",
        finishedAt: new Date(),
        resultJson: JSON.stringify(resultPayload),
      },
      include: { runbook: { select: { name: true } } },
    });

    await appendAuditEvent({
      actor: input.actor,
      action: "RUNBOOK_EXECUTED",
      entityType: "runbook",
      entityId: runbook.id,
      companyId: runbook.companyId,
      reason: `Executed runbook ${runbook.name}`,
      after: mapExecution(row),
    });
    return mapExecution(row);
  } catch (error) {
    await prisma.runbookExecution.update({
      where: { id: execution.id },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        errorJson: JSON.stringify({ message: error instanceof Error ? error.message : String(error) }),
      },
    });
    throw error;
  }
}
