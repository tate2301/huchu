import { NextResponse } from "next/server";
import { createPlatformServices } from "@/scripts/platform/services";
import { requirePlatformAdminAccess } from "../_auth";

export const runtime = "nodejs";

async function safeCount(fn: () => Promise<unknown[]>) {
  try {
    const rows = await fn();
    return Array.isArray(rows) ? rows.length : 0;
  } catch {
    return 0;
  }
}

export async function GET(request: Request) {
  const access = await requirePlatformAdminAccess();
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId") ?? undefined;

  const services = createPlatformServices();
  try {
    const metrics = [
      { id: "orgs", label: "Organizations", value: await safeCount(() => services.org.list({ limit: 500 })) },
      { id: "subscriptions", label: "Subscriptions", value: await safeCount(() => services.subscription.list({ companyId, limit: 500 })) },
      { id: "features", label: "Feature entries", value: await safeCount(() => services.feature.list({ companyId })) },
      { id: "admins", label: "Admins", value: await safeCount(() => services.admin.list({ companyId, limit: 500 })) },
      { id: "users", label: "Users", value: await safeCount(() => services.user.list({ companyId, limit: 500 })) },
      { id: "sites", label: "Sites", value: await safeCount(() => services.site.list({ companyId, limit: 500 })) },
      { id: "audit", label: "Audit events", value: await safeCount(() => services.audit.list({ companyId, limit: 500 })) },
      { id: "support", label: "Support sessions", value: await safeCount(() => services.support.listSessions(companyId)) },
      { id: "runbooks", label: "Runbooks", value: await safeCount(() => services.runbook.listDefinitions(companyId)) },
      { id: "health", label: "Incidents", value: await safeCount(() => services.health.listIncidents({ companyId, limit: 500 })) },
    ];

    return NextResponse.json({ metrics });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load metrics";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
