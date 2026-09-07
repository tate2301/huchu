import { prisma } from "../prisma";
import type {
  HealthIncidentRecord,
  HealthIncidentStatus,
  ListHealthIncidentsInput,
  RecordMetricInput,
  RiskLevel,
  SloMetricSnapshotRecord,
  TriggerRemediationInput,
} from "../types";
import { appendAuditEvent } from "./audit-ledger";
import { formatDate, normalizeEnum, parseIso } from "./helpers";

function inferRiskLevel(metricKey: string, value: number): RiskLevel {
  const key = metricKey.toLowerCase();
  if (key.includes("uptime")) {
    if (value < 95) return "HIGH";
    if (value < 99) return "MEDIUM";
    return "LOW";
  }
  if (key.includes("latency") || key.includes("error")) {
    if (value >= 95) return "HIGH";
    if (value >= 85) return "MEDIUM";
  }
  return "LOW";
}

function mapMetric(row: {
  id: string;
  companyId: string;
  metricKey: string;
  value: number;
  status: string;
  windowStart: Date | null;
  windowEnd: Date | null;
  createdAt: Date;
  company?: { name: string; slug: string } | null;
}): SloMetricSnapshotRecord {
  return {
    id: row.id,
    companyId: row.companyId,
    companyName: row.company?.name ?? null,
    companySlug: row.company?.slug ?? null,
    metricKey: row.metricKey,
    value: row.value,
    status: row.status,
    windowStart: formatDate(row.windowStart),
    windowEnd: formatDate(row.windowEnd),
    createdAt: formatDate(row.createdAt),
  };
}

function mapIncident(row: {
  id: string;
  companyId: string;
  metricKey: string;
  riskLevel: string;
  actionType: string;
  status: string;
  message: string;
  actualValue: number | null;
  thresholdValue: number | null;
  createdAt: Date;
  resolvedAt: Date | null;
  company?: { name: string; slug: string } | null;
}): HealthIncidentRecord {
  return {
    id: row.id,
    companyId: row.companyId,
    companyName: row.company?.name ?? null,
    companySlug: row.company?.slug ?? null,
    metricKey: row.metricKey,
    riskLevel: row.riskLevel as RiskLevel,
    actionType: row.actionType,
    status: row.status as HealthIncidentStatus,
    message: row.message,
    actualValue: row.actualValue,
    thresholdValue: row.thresholdValue,
    createdAt: formatDate(row.createdAt),
    resolvedAt: formatDate(row.resolvedAt),
  };
}

export async function recordMetric(input: RecordMetricInput): Promise<SloMetricSnapshotRecord> {
  const company = await prisma.company.findUnique({ where: { id: input.companyId }, select: { id: true, slug: true } });
  if (!company) throw new Error(`Organization not found for id: ${input.companyId}`);

  const status = String(input.status || "OK").trim().toUpperCase();
  const row = await prisma.tenantSloMetricSnapshot.create({
    data: {
      companyId: input.companyId,
      metricKey: input.metricKey,
      value: input.value,
      status,
      windowStart: parseIso(input.windowStart),
      windowEnd: parseIso(input.windowEnd),
    },
    include: { company: { select: { name: true, slug: true } } },
  });

  if (status !== "OK") {
    const riskLevel = inferRiskLevel(input.metricKey, input.value);
    const incident = await prisma.healthIncident.create({
      data: {
        companyId: input.companyId,
        metricKey: input.metricKey,
        riskLevel,
        actionType: `auto:${input.metricKey}`,
        status: "OPEN",
        message: `Metric ${input.metricKey} entered ${status}`,
        actualValue: input.value,
        thresholdValue: null,
      },
      include: { company: { select: { name: true, slug: true } } },
    });
    await appendAuditEvent({
      actor: "system",
      action: "HEALTH_INCIDENT_OPENED",
      entityType: "health-incident",
      entityId: incident.id,
      companyId: incident.companyId,
      reason: incident.message,
      after: mapIncident(incident),
    });

    if (riskLevel === "LOW") {
      await prisma.healthIncident.update({
        where: { id: incident.id },
        data: { status: "RESOLVED", resolvedAt: new Date() },
      });
      await appendAuditEvent({
        actor: "system",
        action: "HEALTH_REMEDIATED_AUTO",
        entityType: "health-incident",
        entityId: incident.id,
        companyId: incident.companyId,
        reason: "Auto-remediated low-risk incident",
      });
    }
  }

  return mapMetric(row);
}

export async function listMetrics(companyId?: string, limit = 100): Promise<SloMetricSnapshotRecord[]> {
  const rows = await prisma.tenantSloMetricSnapshot.findMany({
    where: companyId ? { companyId } : {},
    include: { company: { select: { name: true, slug: true } } },
    orderBy: [{ createdAt: "desc" }],
    take: limit,
  });
  return rows.map(mapMetric);
}

export async function listHealthIncidents(input?: ListHealthIncidentsInput): Promise<HealthIncidentRecord[]> {
  const status = input?.status
    ? normalizeEnum(input.status, "incident status", ["OPEN", "ACKNOWLEDGED", "RESOLVED"])
    : undefined;
  const rows = await prisma.healthIncident.findMany({
    where: {
      ...(input?.companyId ? { companyId: input.companyId } : {}),
      ...(status ? { status } : {}),
    },
    include: { company: { select: { name: true, slug: true } } },
    orderBy: [{ createdAt: "desc" }],
    take: input?.limit ?? 100,
  });
  return rows.map(mapIncident);
}

export async function triggerRemediation(input: TriggerRemediationInput): Promise<HealthIncidentRecord> {
  const incident = await prisma.healthIncident.findUnique({
    where: { id: input.incidentId },
    include: { company: { select: { name: true, slug: true } } },
  });
  if (!incident) throw new Error(`Health incident not found: ${input.incidentId}`);
  if (incident.status === "RESOLVED") return mapIncident(incident);
  if (incident.riskLevel !== "LOW" && !String(input.reason || "").trim()) {
    throw new Error("Reason is required for medium/high risk remediation.");
  }

  const updated = await prisma.healthIncident.update({
    where: { id: incident.id },
    data: { status: "RESOLVED", resolvedAt: new Date() },
    include: { company: { select: { name: true, slug: true } } },
  });
  await appendAuditEvent({
    actor: input.actor,
    action: "HEALTH_REMEDIATION_APPLIED",
    entityType: "health-incident",
    entityId: updated.id,
    companyId: updated.companyId,
    reason: input.reason ?? `Remediation applied to ${updated.id}`,
    after: mapIncident(updated),
  });
  return mapIncident(updated);
}
