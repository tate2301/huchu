import { NextResponse } from "next/server";
import { createPlatformServices } from "@/scripts/platform/services";
import { requirePlatformAdminAccess } from "../_auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const access = await requirePlatformAdminAccess();
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId")?.trim() || undefined;
  const actor = searchParams.get("actor")?.trim().toLowerCase() || undefined;
  const services = createPlatformServices();

  try {
    const [requests, sessions] = await Promise.all([
      services.support.listRequests({ companyId, limit: 100 }),
      services.support.listSessions(companyId),
    ]);

    const actorPendingRequests = actor
      ? requests.filter((request) => request.requestedBy.trim().toLowerCase() === actor && request.status === "REQUESTED")
      : [];

    const activeSession = actor
      ? sessions.find((session) => session.actor.trim().toLowerCase() === actor && session.status === "ACTIVE") ?? null
      : null;

    return NextResponse.json({
      activeSession,
      actorPendingRequests,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load support state";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
