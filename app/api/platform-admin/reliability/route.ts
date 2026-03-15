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
  const services = createPlatformServices();

  try {
    const [incidents, metrics, runbooks, executions, auditEvents, contractEvaluations] = await Promise.all([
      services.health.listIncidents(companyId ? { companyId, limit: 100 } : { limit: 100 }),
      services.health.listMetrics(companyId, 50),
      services.runbook.listDefinitions(companyId),
      services.runbook.listExecutions(companyId ? { companyId, limit: 100 } : { limit: 100 }),
      services.audit.list(companyId ? { companyId, limit: 100 } : { limit: 100 }),
      (async () => {
        const companyIds = companyId
          ? [companyId]
          : (await services.org.list({ limit: 100 })).map((company) => company.id);

        const evaluations = await Promise.all(
          companyIds.map(async (id) => {
            const result = await services.contract.evaluate({ companyId: id });
            if (!result.ok) {
              throw new Error(result.message);
            }
            return result.resource;
          }),
        );

        return evaluations;
      })(),
    ]);

    return NextResponse.json({
      incidents,
      metrics,
      contractEvaluations,
      runbooks,
      executions,
      auditEvents,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load reliability cluster";
    return NextResponse.json({ error: message }, { status: 400 });
  } finally {
    await services.disconnect();
  }
}
