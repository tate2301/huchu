import { canReadReport } from "@/lib/reports/access";
import { reportMeta } from "@/lib/reports/catalog";
import { resolveParams } from "@/lib/reports/params";
import { getReport } from "@/lib/reports/server";
import { readReportSetting } from "@/lib/reports/settings";
import type {
  ReportContext,
  ReportDefinition,
  ReportLoadResult,
  ReportMeta,
  ReportParam,
  ReportParams,
} from "@/lib/reports/types";
import type { AuthenticatedSession } from "@/lib/auth-core/types";

/**
 * A report, fetched for a session: the one path both the screen and the export
 * take, so they read the same rows under the same checks.
 */

export type ReportFetch = {
  meta: ReportMeta;
  params: ReportParams;
  definition: ReportDefinition;
} & ReportLoadResult;

export function contextFor(session: AuthenticatedSession): ReportContext {
  return { companyId: session.user.companyId, userId: session.user.id, role: session.user.role };
}

/** Null when there is no such report or this session may not read it — the same answer for both. */
export async function fetchReport(
  session: AuthenticatedSession,
  key: string,
  given: ReportParams,
  /** A manager arranging a switched-off report still needs its rows to see the page. */
  { preview = false }: { preview?: boolean } = {},
): Promise<ReportFetch | null> {
  const report = getReport(key);
  if (!report) return null;
  const { definition, loader } = report;
  if (!canReadReport(definition, { role: session.user.role, enabledFeatures: session.user.enabledFeatures })) {
    return null;
  }

  const ctx = contextFor(session);
  // A report the workspace switched off is not there for anybody, the same
  // answer as a report that does not exist.
  const saved = await readReportSetting(ctx.companyId, key);
  if (saved && !saved.enabled && !preview) return null;
  const options = loader.options ? await loader.options(ctx) : {};
  const declared: ReportParam[] = definition.params.map((param) =>
    param.type === "choice" && options[param.key] ? { ...param, options: options[param.key]! } : param,
  );
  const params = resolveParams(declared, given);
  const loaded = await loader.load(ctx, params);
  return { ...loaded, params, definition, meta: reportMeta(definition, session.user.role, declared, saved) };
}

/** The params a request carries: everything in its query string but the view. */
export function paramsFromSearch(search: URLSearchParams): ReportParams {
  const params: ReportParams = {};
  for (const [key, value] of search) if (key !== "v" && key !== "preview" && key !== "template") params[key] = value;
  return params;
}
