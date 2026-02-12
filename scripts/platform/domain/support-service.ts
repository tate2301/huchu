import { prisma } from "../prisma";
import type {
  ApproveSupportAccessInput,
  EndSupportSessionInput,
  ListSupportRequestsInput,
  RequestSupportAccessInput,
  StartSupportSessionInput,
  SupportAccessRequestRecord,
  SupportAccessScope,
  SupportSessionRecord,
} from "../types";
import { appendAuditEvent } from "./audit-ledger";
import { formatDate, normalizeEnum, parseIso } from "./helpers";

function normalizeScope(value?: string): SupportAccessScope {
  if (!value) return "READ_ONLY";
  return normalizeEnum(value, "support scope", ["READ_ONLY", "READ_WRITE"]);
}

function mapRequest(row: {
  id: string;
  companyId: string;
  requestedBy: string;
  approvedBy: string | null;
  reason: string;
  scope: string;
  status: string;
  requestedAt: Date;
  approvedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  company?: { name: string; slug: string } | null;
}): SupportAccessRequestRecord {
  return {
    id: row.id,
    companyId: row.companyId,
    companyName: row.company?.name ?? null,
    companySlug: row.company?.slug ?? null,
    requestedBy: row.requestedBy,
    approvedBy: row.approvedBy,
    reason: row.reason,
    scope: row.scope as SupportAccessScope,
    status: row.status as SupportAccessRequestRecord["status"],
    requestedAt: formatDate(row.requestedAt),
    approvedAt: formatDate(row.approvedAt),
    expiresAt: formatDate(row.expiresAt),
    createdAt: formatDate(row.createdAt),
    updatedAt: formatDate(row.updatedAt),
  };
}

function mapSession(row: {
  id: string;
  requestId: string | null;
  companyId: string;
  actor: string;
  mode: string;
  scope: string;
  status: string;
  reason: string;
  startedAt: Date;
  endedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  company?: { name: string; slug: string } | null;
}): SupportSessionRecord {
  return {
    id: row.id,
    requestId: row.requestId,
    companyId: row.companyId,
    companyName: row.company?.name ?? null,
    companySlug: row.company?.slug ?? null,
    actor: row.actor,
    mode: row.mode as SupportSessionRecord["mode"],
    scope: row.scope as SupportAccessScope,
    status: row.status as SupportSessionRecord["status"],
    reason: row.reason,
    startedAt: formatDate(row.startedAt),
    endedAt: formatDate(row.endedAt),
    expiresAt: formatDate(row.expiresAt),
    createdAt: formatDate(row.createdAt),
    updatedAt: formatDate(row.updatedAt),
  };
}

export async function listSupportRequests(input?: ListSupportRequestsInput): Promise<SupportAccessRequestRecord[]> {
  const status = input?.status
    ? normalizeEnum(input.status, "support status", ["REQUESTED", "APPROVED", "ACTIVE", "EXPIRED", "REVOKED", "DENIED"])
    : undefined;
  const rows = await prisma.supportAccessRequest.findMany({
    where: {
      ...(input?.companyId ? { companyId: input.companyId } : {}),
      ...(status ? { status } : {}),
    },
    include: { company: { select: { name: true, slug: true } } },
    orderBy: [{ createdAt: "desc" }],
    take: input?.limit ?? 100,
  });
  return rows.map(mapRequest);
}

export async function listSupportSessions(companyId?: string): Promise<SupportSessionRecord[]> {
  const rows = await prisma.supportSession.findMany({
    where: companyId ? { companyId } : {},
    include: { company: { select: { name: true, slug: true } } },
    orderBy: [{ createdAt: "desc" }],
    take: 100,
  });
  return rows.map(mapSession);
}

export async function requestSupportAccess(input: RequestSupportAccessInput): Promise<SupportAccessRequestRecord> {
  const reason = String(input.reason || "").trim();
  if (!reason) throw new Error("Reason is required.");
  const company = await prisma.company.findUnique({
    where: { id: input.companyId },
    select: { id: true, slug: true },
  });
  if (!company) throw new Error(`Organization not found for id: ${input.companyId}`);

  const ttlMinutes = Math.max(5, Math.min(480, Number(input.ttlMinutes ?? 60)));
  const expiresAt = new Date(Date.now() + ttlMinutes * 60_000);
  const row = await prisma.supportAccessRequest.create({
    data: {
      companyId: input.companyId,
      requestedBy: input.requestedBy,
      reason,
      scope: normalizeScope(input.scope),
      status: "REQUESTED",
      requestedAt: new Date(),
      expiresAt,
    },
    include: { company: { select: { name: true, slug: true } } },
  });

  await appendAuditEvent({
    actor: input.requestedBy,
    action: "SUPPORT_REQUEST_CREATED",
    entityType: "support-request",
    entityId: row.id,
    companyId: row.companyId,
    reason: `Support request created for ${company.slug}`,
    after: mapRequest(row),
  });

  return mapRequest(row);
}

export async function approveSupportAccess(input: ApproveSupportAccessInput): Promise<SupportAccessRequestRecord> {
  const request = await prisma.supportAccessRequest.findUnique({
    where: { id: input.requestId },
    include: { company: { select: { name: true, slug: true } } },
  });
  if (!request) throw new Error(`Support request not found: ${input.requestId}`);
  if (request.status !== "REQUESTED") throw new Error(`Support request ${request.id} is ${request.status}.`);

  const status = input.approve ? "APPROVED" : "DENIED";
  const row = await prisma.supportAccessRequest.update({
    where: { id: request.id },
    data: {
      approvedBy: input.approvedBy,
      approvedAt: new Date(),
      status,
    },
    include: { company: { select: { name: true, slug: true } } },
  });

  await appendAuditEvent({
    actor: input.approvedBy,
    action: input.approve ? "SUPPORT_REQUEST_APPROVED" : "SUPPORT_REQUEST_DENIED",
    entityType: "support-request",
    entityId: row.id,
    companyId: row.companyId,
    reason: input.reason ?? `${status} support request`,
    after: mapRequest(row),
  });

  return mapRequest(row);
}

export async function startSupportSession(input: StartSupportSessionInput): Promise<SupportSessionRecord> {
  const request = await prisma.supportAccessRequest.findUnique({
    where: { id: input.requestId },
    include: { company: { select: { name: true, slug: true } } },
  });
  if (!request) throw new Error(`Support request not found: ${input.requestId}`);
  if (request.status !== "APPROVED") throw new Error(`Support request ${request.id} is not approved.`);
  if (request.expiresAt && request.expiresAt.getTime() <= Date.now()) {
    await prisma.supportAccessRequest.update({ where: { id: request.id }, data: { status: "EXPIRED" } });
    throw new Error(`Support request ${request.id} is expired.`);
  }

  const existingActive = await prisma.supportSession.findFirst({
    where: { requestId: request.id, status: "ACTIVE" },
    select: { id: true },
  });
  if (existingActive) throw new Error(`Support session already active for request ${request.id}.`);

  const row = await prisma.$transaction(async (tx) => {
    const session = await tx.supportSession.create({
      data: {
        requestId: request.id,
        companyId: request.companyId,
        actor: input.actor,
        mode: input.mode ?? "IMPERSONATE",
        scope: request.scope,
        status: "ACTIVE",
        reason: request.reason,
        startedAt: new Date(),
        expiresAt: request.expiresAt,
      },
      include: { company: { select: { name: true, slug: true } } },
    });
    await tx.supportAccessRequest.update({ where: { id: request.id }, data: { status: "ACTIVE" } });
    return session;
  });

  await appendAuditEvent({
    actor: input.actor,
    action: "SUPPORT_SESSION_STARTED",
    entityType: "support-session",
    entityId: row.id,
    companyId: row.companyId,
    reason: `Started support session for ${row.company.slug}`,
    after: mapSession(row),
  });
  return mapSession(row);
}

export async function endSupportSession(input: EndSupportSessionInput): Promise<SupportSessionRecord> {
  const session = await prisma.supportSession.findUnique({
    where: { id: input.sessionId },
    include: { company: { select: { name: true, slug: true } } },
  });
  if (!session) throw new Error(`Support session not found: ${input.sessionId}`);
  if (session.status !== "ACTIVE") throw new Error(`Support session ${session.id} is ${session.status}.`);

  const row = await prisma.$transaction(async (tx) => {
    const updated = await tx.supportSession.update({
      where: { id: session.id },
      data: { status: "REVOKED", endedAt: new Date() },
      include: { company: { select: { name: true, slug: true } } },
    });
    if (updated.requestId) {
      await tx.supportAccessRequest.update({
        where: { id: updated.requestId },
        data: { status: "REVOKED" },
      });
    }
    return updated;
  });

  await appendAuditEvent({
    actor: input.actor,
    action: "SUPPORT_SESSION_ENDED",
    entityType: "support-session",
    entityId: row.id,
    companyId: row.companyId,
    reason: input.reason ?? "Support session ended",
    after: mapSession(row),
  });

  return mapSession(row);
}

export async function expireSupportSessions(nowIso?: string): Promise<{ expiredCount: number }> {
  const now = parseIso(nowIso) ?? new Date();
  const result = await prisma.supportSession.updateMany({
    where: { status: "ACTIVE", expiresAt: { not: null, lt: now } },
    data: { status: "EXPIRED", endedAt: now },
  });
  if (result.count > 0) {
    await appendAuditEvent({
      actor: "system",
      action: "SUPPORT_SESSION_EXPIRED",
      entityType: "support-session",
      reason: `Expired ${result.count} support sessions`,
      metadata: { count: result.count },
    });
  }
  return { expiredCount: result.count };
}
