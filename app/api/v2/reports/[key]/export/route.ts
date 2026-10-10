import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, validateSession } from "@/lib/api-utils";
import type { AuthenticatedSession } from "@/lib/auth-core/types";
import { getDocumentBranding } from "@/lib/documents/branding-snapshot";
import { resolveCatalogTemplateEntry } from "@/lib/documents/default-template-catalog";
import { renderDocumentShell } from "@/lib/documents/html-renderer";
import { renderPdfFromHtml } from "@/lib/documents/pdf-renderer";
import { resolveTemplate } from "@/lib/documents/template-resolver";
import { prisma } from "@/lib/prisma";
import { exportFileName, exportRows } from "@/lib/reports/export";
import { EXPORT_TEMPLATES, exportDocument, orientationFor } from "@/lib/reports/export-templates";
import { buildWorkbook } from "@/lib/reports/export-xlsx";
import { periodRange, publicListSpec } from "@/lib/reports/list-query";
import { fetchListExport, fetchReport, type ListExport } from "@/lib/reports/request";
import type { ReportDefinition, ReportMeta, ReportParam, ReportParams, ReportView } from "@/lib/reports/types";
import { applyView, reportViewSchema, type AppliedView } from "@/lib/reports/view";
import { auditExportDownloaded } from "@/lib/retail/audit";

const listQuerySchema = z.object({
  tab: z.string().max(64).optional(),
  q: z.string().max(200).optional(),
  sort: z.string().max(80).optional(),
  group: z.string().max(64).optional(),
  page: z.number().int().min(1).default(1),
  size: z.number().int().default(50),
  filters: z.record(z.string().max(64), z.string().max(100)).default({}),
  hidden: z.array(z.string().max(64)).max(80).optional(),
  /** Reports: the face, the template under the query, "One row for each" and the columns in order. */
  face: z.enum(["list", "report"]).optional(),
  // A list page sends back the query the API resolved, where "none" is null.
  template: z
    .string()
    .max(100)
    .nullish()
    .transform((value) => value ?? undefined),
  rows: z.array(z.string().max(64)).max(8).optional(),
  cols: z
    .array(z.string().max(64))
    .max(80)
    .nullish()
    .transform((value) => value ?? undefined),
});

const bodySchema = z
  .object({
    format: z.enum(["csv", "xlsx", "pdf"]),
    /** Which layout a PDF is printed in. */
    template: z.enum(EXPORT_TEMPLATES).default("layout"),
    /** A list export: the list's query, as the page has it. */
    query: listQuerySchema.optional(),
    /** A report export: the view on screen and the params it was fetched with. */
    view: reportViewSchema.optional(),
    params: z.record(z.string(), z.string()).default({}),
    /** Only these rows, when somebody exported a selection. */
    rowIds: z.array(z.string()).max(5000).optional(),
  })
  // Exactly one of the two.
  .refine((body) => Boolean(body.query) !== Boolean(body.view));

type ExportBody = z.infer<typeof bodySchema>;

type Prepared = {
  meta: ReportMeta;
  params: ReportParams;
  applied: AppliedView;
  view: ReportView;
  definition: ReportDefinition;
  rows: number;
  /** The file stops at the engine's row limit: how many the query found, when the database counted them. */
  cut: { of: number | null } | null;
};

/**
 * A list's query in the words a file prints under its title: its period as a
 * report's from and to, its choices as a report's choice params — so the
 * header, the About sheet and the file name read the same as a report's.
 */
function listExportParams(found: ListExport): { meta: ReportMeta; params: ReportParams } {
  const declared: ReportParam[] = [];
  const params: ReportParams = {};
  const period = found.definition.list.filters.find((filter) => filter.type === "period");
  if (period?.type === "period") {
    declared.push({ key: "from", label: period.label, type: "date" }, { key: "to", label: "To", type: "date" });
    const range = periodRange(found.resolved.filters[period.key] ?? "any", found.ctx.now, found.ctx.timeZone);
    params.from = range?.from ?? "";
    params.to = range?.to ?? "";
  }
  for (const filter of publicListSpec(found.definition.list, found.ctx, found.loaded).filters) {
    if (filter.type !== "choice") continue;
    declared.push({
      key: filter.key,
      label: filter.label,
      type: "choice",
      options: [{ value: "any", label: filter.any }, ...(filter.options ?? []).map(({ value, label }) => ({ value, label }))],
    });
    params[filter.key] = found.resolved.filters[filter.key] ?? "any";
  }
  return { meta: { ...found.meta, params: declared }, params };
}

async function prepare(
  session: AuthenticatedSession,
  key: string,
  body: ExportBody,
): Promise<Prepared | { status: number; error: string }> {
  if (body.query) {
    const found = await fetchListExport(session, key, body.query, body.rowIds);
    if ("error" in found) return found;
    const { meta, params } = listExportParams(found);
    const view: ReportView = {
      ...found.view,
      columns: meta.columns.map((column) => ({ key: column.key, hidden: found.resolved.hidden.includes(column.key) })),
      conditions: [],
      search: found.resolved.q,
    };
    const rows = found.ordered.length;
    // A database-paged source counts every row it matched; a source read in memory only knows it stopped.
    const cut = body.rowIds ? null : found.result.total > rows ? { of: found.result.total } : found.result.truncated ? { of: null } : null;
    return { meta, params, applied: found.applied, view, definition: found.definition, rows, cut };
  }

  const report = await fetchReport(session, key, body.params);
  if (!report) return { status: 404, error: "Report not found" };
  const wanted = body.rowIds ? new Set(body.rowIds) : null;
  const rows = wanted ? report.rows.filter((row) => wanted.has(row.id)) : report.rows;
  const applied = applyView(rows, report.meta.columns, body.view!);
  return {
    meta: report.meta,
    params: report.params,
    applied,
    view: body.view!,
    definition: report.definition,
    rows: applied.rows.length,
    cut: report.truncated && !wanted ? { of: null } : null,
  };
}

async function render(
  session: AuthenticatedSession,
  key: string,
  body: ExportBody,
  prepared: Prepared,
): Promise<NextResponse> {
  const { format, template: layout } = body;
  const { meta, params, applied, view } = prepared;
  const fileName = exportFileName(meta, params, format, format === "pdf" ? layout : null);
  const input = { meta, params, applied, view, selected: Boolean(body.rowIds), generatedAt: new Date() };

  if (format === "xlsx") {
    const workbook = await buildWorkbook(input);
    return new NextResponse(new Uint8Array(workbook), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  }

  if (format === "csv") {
    return new NextResponse(exportRows(applied, view), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  }

  // A report with a template of its own uses it; the rest use the generic
  // table's, which is landscape and compact.
  const sourceKey = resolveCatalogTemplateEntry({
    sourceKey: `reports.${key}`,
    documentType: "REPORT_TABLE",
    targetType: "LIST",
  })
    ? `reports.${key}`
    : `ui.table.reports.${key}`;
  const [template, branding] = await Promise.all([
    resolveTemplate({ companyId: session.user.companyId, documentType: "REPORT_TABLE", targetType: "LIST", sourceKey }),
    getDocumentBranding(session.user.companyId),
  ]);
  // The tenant's paper — margins, masthead, footer — laid the way this
  // layout reads, under the report's own name rather than the template's.
  const schema = {
    ...template.templateSchema,
    page: { ...template.templateSchema.page, orientation: orientationFor(layout, applied.columns.length) },
    labels: { ...template.templateSchema.labels, documentTitle: undefined },
  };
  const document = exportDocument(layout, input);
  const html = renderDocumentShell({ branding, template: schema, ...document });
  const pdf = await renderPdfFromHtml({ html, template: schema });
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}

/**
 * A list or a report as it was on screen, as a file (00-foundations 4.2, W-55).
 *
 * The rows are fetched again here rather than taken from the browser, under
 * the same permission check and through the same engine the screen used — a
 * list through its query, a report through its view — so the file is the
 * table, and nothing in it came from anywhere but the database. Grouped, the
 * groups print as headed sections with their subtotals; the totals are last.
 * A retail source writes `RETAIL_EXPORT.DOWNLOADED`.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { key } = await params;

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return errorResponse("That export request could not be read", 400);

    const prepared = await prepare(session, key, parsed.data);
    if ("error" in prepared) return errorResponse(prepared.error, prepared.status);

    const response = await render(session, key, parsed.data, prepared);
    // The page says so when the file stops short of what the list found.
    if (prepared.cut) {
      response.headers.set("X-Export-Rows", String(prepared.rows));
      if (prepared.cut.of !== null) response.headers.set("X-Export-Of", String(prepared.cut.of));
    }

    if (prepared.definition.href.startsWith("/retail")) {
      await auditExportDownloaded(prisma, {
        actor: {
          companyId: session.user.companyId,
          userId: session.user.id,
          userName: session.user.name,
          userRole: session.user.role,
        },
        key,
        format: parsed.data.format,
        rows: prepared.rows,
      });
    }
    return response;
  } catch (error) {
    console.error("[API] POST /api/v2/reports/[key]/export error:", error);
    return errorResponse("Failed to export report");
  }
}
