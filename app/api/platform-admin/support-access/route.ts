import { NextResponse } from "next/server";
import { createPlatformServices } from "@/scripts/platform/services";
import { requirePlatformAdminAccess } from "../_auth";

function includesSearch(values: Array<string | null | undefined>, search: string) {
  const haystack = values.filter(Boolean).join(" ").toLowerCase();
  return haystack.includes(search);
}

export const runtime = "nodejs";

export async function GET(request: Request) {
  const access = await requirePlatformAdminAccess();
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId")?.trim() || undefined;
  const search = searchParams.get("search")?.trim().toLowerCase() ?? "";
  const services = createPlatformServices();

  try {
    const [requests, sessions] = await Promise.all([
      services.support.listRequests({ companyId, limit: 100 }),
      services.support.listSessions(companyId),
    ]);

    const filteredRequests = search
      ? requests.filter((row) =>
          includesSearch(
            [row.id, row.companyName, row.companySlug, row.requestedBy, row.approvedBy, row.reason, row.scope, row.status],
            search,
          ),
        )
      : requests;

    const filteredSessions = search
      ? sessions.filter((row) =>
          includesSearch(
            [row.id, row.companyName, row.companySlug, row.actor, row.mode, row.scope, row.status, row.reason],
            search,
          ),
        )
      : sessions;

    return NextResponse.json({
      requests: filteredRequests,
      sessions: filteredSessions,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load support access";
    return NextResponse.json({ error: message }, { status: 400 });
  } finally {
    await services.disconnect();
  }
}
