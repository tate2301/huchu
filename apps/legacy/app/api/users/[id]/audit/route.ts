import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@corelithzw/db/client";

import { canViewUserManagement } from "../../_helpers";

const LIMIT = 100;

/**
 * What has been done to this account, and what this account has done.
 *
 * Two tables answer half the question each: provisioning events record the
 * things admins did to somebody (created, suspended, re-permissioned), and
 * platform audit events record the things that person did. An admin looking at
 * a suspended account wants both in one column, because the reason for the
 * suspension is usually sitting in the other table.
 */
type AuditRow = {
  id: string;
  kind: "ACCOUNT" | "ACTIVITY";
  eventType: string;
  message: string;
  actor: string | null;
  createdAt: string;
};

function parseActor(payloadJson: string | null): string | null {
  if (!payloadJson) return null;
  try {
    const parsed = JSON.parse(payloadJson) as { actorId?: unknown; actorRole?: unknown };
    if (typeof parsed.actorRole === "string" && parsed.actorRole) return parsed.actorRole;
    if (typeof parsed.actorId === "string" && parsed.actorId) return parsed.actorId;
    return null;
  } catch {
    return null;
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    if (!canViewUserManagement(session)) {
      return errorResponse("Insufficient permissions to view users", 403);
    }

    const { id } = await context.params;

    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, companyId: true, email: true },
    });

    if (!user || user.companyId !== session.user.companyId) {
      return errorResponse("User not found for this organization.", 404);
    }

    const [provisioning, platform] = await Promise.all([
      prisma.provisioningEvent.findMany({
        where: {
          companyId: session.user.companyId,
          // The user id is written into the payload by every user-management
          // action, which is what makes this row belong to this person.
          payloadJson: { contains: user.id },
        },
        select: {
          id: true,
          eventType: true,
          message: true,
          payloadJson: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: LIMIT,
      }),
      prisma.platformAuditEvent.findMany({
        where: {
          companyId: session.user.companyId,
          OR: [{ actor: user.id }, { actor: user.email }, { entityId: user.id }],
        },
        select: {
          id: true,
          eventType: true,
          entityType: true,
          entityId: true,
          reason: true,
          actor: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: LIMIT,
      }),
    ]);

    const rows: AuditRow[] = [
      ...provisioning.map((event) => ({
        id: `provisioning:${event.id}`,
        kind: "ACCOUNT" as const,
        eventType: event.eventType,
        message: event.message ?? event.eventType,
        actor: parseActor(event.payloadJson),
        createdAt: event.createdAt.toISOString(),
      })),
      ...platform.map((event) => ({
        id: `platform:${event.id}`,
        kind: "ACTIVITY" as const,
        eventType: event.eventType,
        message:
          event.reason ??
          [event.entityType, event.entityId].filter(Boolean).join(" ") ??
          event.eventType,
        actor: event.actor,
        createdAt: event.createdAt.toISOString(),
      })),
    ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return successResponse({ data: rows.slice(0, LIMIT) });
  } catch (error) {
    console.error("[API] GET /api/users/[id]/audit error:", error);
    return errorResponse("Failed to load the user audit log");
  }
}
