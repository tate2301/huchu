import type { AuthenticatedSession } from "@/lib/auth-core/types";
import { canReadReport } from "@/lib/reports/access";
import type { Reader } from "@/lib/reports/custom/store";
import { REPORT_DEFINITIONS } from "@/lib/reports/registry";
import { disabledReportKeys } from "@/lib/reports/settings";
import type { ReportColumn, ReportDefinition, ReportParam } from "@/lib/reports/types";

/**
 * The report sources a person can build on: exactly the reports they can
 * open, so a custom report can never read a row its reader could not already
 * see on a report of its own. Server-only.
 */

/** A source as the editor knows it: what it is called and the columns it has. */
export type ReportSource = {
  key: string;
  title: string;
  area: string;
  columns: ReportColumn[];
  params: ReportParam[];
};

export function readerOf(session: AuthenticatedSession): Reader {
  return { companyId: session.user.companyId, userId: session.user.id, role: session.user.role };
}

export async function readableSources(session: AuthenticatedSession): Promise<ReportDefinition[]> {
  const access = { role: session.user.role, enabledFeatures: session.user.enabledFeatures };
  const disabled = await disabledReportKeys(session.user.companyId);
  return REPORT_DEFINITIONS.filter((definition) => !disabled.has(definition.key) && canReadReport(definition, access));
}

export function toSource(definition: ReportDefinition): ReportSource {
  return {
    key: definition.key,
    title: definition.title,
    area: definition.area,
    columns: definition.columns,
    params: definition.params,
  };
}
