import { prisma } from "../prisma";
import type {
  AuditEventRecord,
  AuditExportInput,
  AuditExportResult,
  AuditVerifyChainResult,
} from "../types";
import {
  formatDate,
  hashSha256,
  isMissingTableError,
  parseIso,
  parsePayload,
  stableJsonStringify,
} from "./helpers";

export interface AppendAuditEventInput {
  actor?: string | null;
  action?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  companyId?: string | null;
  reason?: string | null;
  before?: unknown;
  after?: unknown;
  metadata?: unknown;
}

export async function appendAuditEvent(input: AppendAuditEventInput): Promise<AuditEventRecord> {
  const payload = {
    actor: input.actor ?? null,
    action: input.action ?? null,
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    reason: input.reason ?? null,
    before: input.before ?? null,
    after: input.after ?? null,
    metadata: input.metadata ?? null,
  };
  const companyId = input.companyId ?? null;

  let eventHash: string | null = null;
  let prevEventHash: string | null = null;

  try {
    const previous = await prisma.platformAuditEvent.findFirst({
      where: { companyId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { eventHash: true },
    });
    prevEventHash = previous?.eventHash ?? null;
    eventHash = hashSha256(
      stableJsonStringify({
        companyId,
        eventType: payload.action ?? "AUDIT_EVENT",
        entityType: payload.entityType,
        entityId: payload.entityId,
        actor: payload.actor,
        reason: payload.reason,
        payload,
        prevEventHash,
      }),
    );

    await prisma.platformAuditEvent.create({
      data: {
        companyId,
        actor: payload.actor,
        eventType: payload.action ?? "AUDIT_EVENT",
        entityType: payload.entityType,
        entityId: payload.entityId,
        reason: payload.reason,
        payloadJson: JSON.stringify(payload),
        eventHash,
        prevEventHash,
      },
    });
  } catch (error) {
    if (!isMissingTableError(error)) {
      throw error;
    }
  }

  if (companyId) {
    await prisma.provisioningEvent.create({
      data: {
        companyId,
        eventType: payload.action ?? "AUDIT_EVENT",
        status: "SUCCESS",
        message: payload.reason ?? payload.action ?? "Audit event",
        payloadJson: JSON.stringify(payload),
        startedAt: new Date(),
        finishedAt: new Date(),
      },
    });
  }

  return {
    id: eventHash ? `ledger-${eventHash.slice(0, 12)}` : `local-${Date.now()}`,
    timestamp: new Date().toISOString(),
    actor: payload.actor,
    action: payload.action,
    entityType: payload.entityType,
    entityId: payload.entityId,
    companyId,
    reason: payload.reason,
    payload,
    eventHash,
    prevEventHash,
  };
}

export async function listAuditEvents(input?: {
  companyId?: string;
  action?: string;
  actor?: string;
  limit?: number;
}): Promise<AuditEventRecord[]> {
  try {
    const rows = await prisma.platformAuditEvent.findMany({
      where: {
        ...(input?.companyId ? { companyId: input.companyId } : {}),
        ...(input?.action ? { eventType: input.action.trim().toUpperCase() } : {}),
        ...(input?.actor ? { actor: input.actor } : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: input?.limit ?? 100,
    });
    return rows.map((row) => ({
      id: row.id,
      timestamp: formatDate(row.createdAt),
      actor: row.actor ?? null,
      action: row.eventType,
      entityType: row.entityType ?? null,
      entityId: row.entityId ?? null,
      companyId: row.companyId ?? null,
      reason: row.reason ?? null,
      payload: parsePayload(row.payloadJson),
      eventHash: row.eventHash,
      prevEventHash: row.prevEventHash ?? null,
    }));
  } catch (error) {
    if (!isMissingTableError(error)) throw error;
  }

  const rows = await prisma.provisioningEvent.findMany({
    where: {
      ...(input?.companyId ? { companyId: input.companyId } : {}),
      ...(input?.action ? { eventType: input.action.trim().toUpperCase() } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: input?.limit ?? 100,
    select: { id: true, createdAt: true, companyId: true, eventType: true, message: true, payloadJson: true },
  });
  const mapped = rows.map((row) => {
    const payload = parsePayload(row.payloadJson);
    return {
      id: row.id,
      timestamp: formatDate(row.createdAt),
      actor: typeof payload.actor === "string" ? payload.actor : null,
      action: row.eventType,
      entityType: typeof payload.entityType === "string" ? payload.entityType : null,
      entityId: typeof payload.entityId === "string" ? payload.entityId : null,
      companyId: row.companyId,
      reason: row.message,
      payload,
    } as AuditEventRecord;
  });
  if (!input?.actor) return mapped;
  const actor = input.actor.trim().toLowerCase();
  return mapped.filter((row) => String(row.actor || "").toLowerCase() === actor);
}

export async function exportAudit(input: AuditExportInput): Promise<AuditExportResult> {
  const fromDate = parseIso(input.from);
  const toDate = parseIso(input.to);
  const rows = await prisma.platformAuditEvent.findMany({
    where: {
      ...(input.companyId ? { companyId: input.companyId } : {}),
      ...(input.actor ? { actor: input.actor } : {}),
      ...(input.action ? { eventType: input.action.trim().toUpperCase() } : {}),
      ...(fromDate || toDate
        ? {
            createdAt: {
              ...(fromDate ? { gte: fromDate } : {}),
              ...(toDate ? { lte: toDate } : {}),
            },
          }
        : {}),
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  const format = input.format ?? "json";
  if (format === "csv") {
    const header = ["id", "timestamp", "actor", "action", "entityType", "entityId", "companyId", "reason", "eventHash", "prevEventHash"];
    const lines = rows.map((row) =>
      [
        row.id,
        formatDate(row.createdAt) ?? "",
        row.actor ?? "",
        row.eventType,
        row.entityType ?? "",
        row.entityId ?? "",
        row.companyId ?? "",
        row.reason ?? "",
        row.eventHash,
        row.prevEventHash ?? "",
      ]
        .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
        .join(","),
    );
    return {
      format: "csv",
      generatedAt: new Date().toISOString(),
      count: rows.length,
      content: [header.join(","), ...lines].join("\n"),
    };
  }

  return {
    format: "json",
    generatedAt: new Date().toISOString(),
    count: rows.length,
    content: JSON.stringify(
      rows.map((row) => ({
        id: row.id,
        timestamp: formatDate(row.createdAt),
        actor: row.actor,
        action: row.eventType,
        entityType: row.entityType,
        entityId: row.entityId,
        companyId: row.companyId,
        reason: row.reason,
        eventHash: row.eventHash,
        prevEventHash: row.prevEventHash,
        payload: parsePayload(row.payloadJson),
      })),
      null,
      2,
    ),
  };
}

export async function verifyAuditChain(companyId?: string): Promise<AuditVerifyChainResult> {
  const rows = await prisma.platformAuditEvent.findMany({
    where: companyId ? { companyId } : {},
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  let checked = 0;
  for (const row of rows) {
    const payload = parsePayload(row.payloadJson);
    const expectedHash = hashSha256(
      stableJsonStringify({
        companyId: row.companyId ?? null,
        eventType: row.eventType,
        entityType: row.entityType ?? null,
        entityId: row.entityId ?? null,
        actor: row.actor ?? null,
        reason: row.reason ?? null,
        payload,
        prevEventHash: row.prevEventHash ?? null,
      }),
    );
    checked += 1;
    if (expectedHash !== row.eventHash) {
      return {
        ok: false,
        checked,
        brokenEventId: row.id,
        message: `Hash mismatch at ${row.id}.`,
      };
    }
  }

  return {
    ok: true,
    checked,
    message: `Verified ${checked} event hashes.`,
  };
}
