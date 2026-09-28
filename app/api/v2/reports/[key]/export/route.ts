import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, validateSession } from "@/lib/api-utils";
import { getDocumentBranding } from "@/lib/documents/branding-snapshot";
import { resolveCatalogTemplateEntry } from "@/lib/documents/default-template-catalog";
import { renderDocumentShell } from "@/lib/documents/html-renderer";
import { renderPdfFromHtml } from "@/lib/documents/pdf-renderer";
import { resolveTemplate } from "@/lib/documents/template-resolver";
import { exportFileName, exportRows } from "@/lib/reports/export";
import {
  EXPORT_TEMPLATE_ORIENTATION,
  EXPORT_TEMPLATES,
  exportDocument,
} from "@/lib/reports/export-templates";
import { buildWorkbook } from "@/lib/reports/export-xlsx";
import { fetchReport } from "@/lib/reports/request";
import { applyView, reportViewSchema } from "@/lib/reports/view";

const bodySchema = z.object({
  format: z.enum(["csv", "xlsx", "pdf"]),
  /** Which layout a PDF is printed in. */
  template: z.enum(EXPORT_TEMPLATES).default("register"),
  params: z.record(z.string(), z.string()).default({}),
  view: reportViewSchema,
  /** Only these rows, when somebody exported a selection. */
  rowIds: z.array(z.string()).max(5000).optional(),
});

/**
 * The report as it was on screen, as a file.
 *
 * The rows are fetched again here rather than taken from the browser, and the
 * same view is applied to them by the same code the table used — so the file
 * is the table, and nothing in it came from anywhere but the database.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { key } = await params;

    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) return errorResponse("That export request could not be read", 400);
    const { format, template: layout, view, rowIds } = parsed.data;

    const report = await fetchReport(session, key, parsed.data.params);
    if (!report) return errorResponse("Report not found", 404);

    const wanted = rowIds ? new Set(rowIds) : null;
    const rows = wanted ? report.rows.filter((row) => wanted.has(row.id)) : report.rows;
    const applied = applyView(rows, report.meta.columns, view);
    const fileName = exportFileName(report.meta, report.params, format, format === "pdf" ? layout : null);

    if (format === "xlsx") {
      const workbook = await buildWorkbook({
        meta: report.meta,
        params: report.params,
        applied,
        view,
        selected: Boolean(wanted),
        generatedAt: new Date(),
      });
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
      page: { ...template.templateSchema.page, orientation: EXPORT_TEMPLATE_ORIENTATION[layout] },
      labels: { ...template.templateSchema.labels, documentTitle: undefined },
    };
    const document = exportDocument(layout, {
      meta: report.meta,
      params: report.params,
      applied,
      view,
      selected: Boolean(wanted),
      generatedAt: new Date(),
    });
    const html = renderDocumentShell({ branding, template: schema, ...document });
    const pdf = await renderPdfFromHtml({ html, template: schema });
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    console.error("[API] POST /api/v2/reports/[key]/export error:", error);
    return errorResponse("Failed to export report");
  }
}
