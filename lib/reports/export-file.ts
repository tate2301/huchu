import { getDocumentBranding } from "@/lib/documents/branding-snapshot";
import { resolveCatalogTemplateEntry } from "@/lib/documents/default-template-catalog";
import { renderDocumentShell } from "@/lib/documents/html-renderer";
import { renderPdfFromHtml } from "@/lib/documents/pdf-renderer";
import { resolveTemplate } from "@/lib/documents/template-resolver";
import { exportFileName, exportRows } from "@/lib/reports/export";
import type { ExportTemplateId } from "@/lib/reports/export-layouts";
import { exportDocument, orientationFor } from "@/lib/reports/export-templates";
import { buildWorkbook } from "@/lib/reports/export-xlsx";
import type { ReportMeta, ReportParams, ReportView } from "@/lib/reports/types";
import type { AppliedView } from "@/lib/reports/view";

/**
 * A report as a file: CSV, an Excel workbook, or a PDF in one of its layouts
 * on the workspace's paper. Export downloads it and Send it emails it, so the
 * file somebody is sent is the file they would have downloaded.
 */

export type ReportFileFormat = "csv" | "xlsx" | "pdf";

export type ReportFile = { fileName: string; contentType: string; body: Buffer };

export async function renderReportFile(input: {
  companyId: string;
  key: string;
  format: ReportFileFormat;
  layout: ExportTemplateId;
  meta: ReportMeta;
  params: ReportParams;
  applied: AppliedView;
  view: ReportView;
  /** Only the selected rows were asked for. */
  selected: boolean;
}): Promise<ReportFile> {
  const { companyId, key, format, layout, meta, params, applied, view } = input;
  const fileName = exportFileName(meta, params, format, format === "pdf" ? layout : null);
  const document = { meta, params, applied, view, selected: input.selected, generatedAt: new Date() };

  if (format === "xlsx") {
    return {
      fileName,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      body: Buffer.from(await buildWorkbook(document)),
    };
  }

  if (format === "csv") {
    return { fileName, contentType: "text/csv; charset=utf-8", body: Buffer.from(exportRows(applied, view), "utf8") };
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
    resolveTemplate({ companyId, documentType: "REPORT_TABLE", targetType: "LIST", sourceKey }),
    getDocumentBranding(companyId),
  ]);
  // The tenant's paper — margins, masthead, footer — laid the way this
  // layout reads, under the report's own name rather than the template's.
  const schema = {
    ...template.templateSchema,
    page: { ...template.templateSchema.page, orientation: orientationFor(layout, applied.columns.length) },
    labels: { ...template.templateSchema.labels, documentTitle: undefined },
  };
  const html = renderDocumentShell({ branding, template: schema, ...exportDocument(layout, document) });
  const pdf = await renderPdfFromHtml({ html, template: schema });
  return { fileName, contentType: "application/pdf", body: Buffer.from(pdf) };
}
