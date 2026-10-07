import { getDocumentBranding } from "@/lib/documents/branding-snapshot";
import { renderDocumentShell } from "@/lib/documents/html-renderer";
import { renderPdfFromHtml } from "@/lib/documents/pdf-renderer";
import { resolveTemplate } from "@/lib/documents/template-resolver";

import { Z_REPORT_CSS, zReportsHtml } from "./z-report-bulk";
import type { RetailZReportPayload } from "./z-report";

/**
 * Z-reports as one PDF, a report a page (the Shifts list's print, Past days'
 * downloads, End of day's links). `subtitle` replaces the stored-report line:
 * an X-report says it is not final.
 */
export async function zReportsPdf(companyId: string, reports: RetailZReportPayload[], options: { title?: string; subtitle?: string } = {}) {
  const [template, branding] = await Promise.all([
    resolveTemplate({ companyId, documentType: "REPORT_TABLE", targetType: "LIST", sourceKey: "ui.table.reports.retail-z-reports" }),
    getDocumentBranding(companyId),
  ]);
  const schema = {
    ...template.templateSchema,
    page: { ...template.templateSchema.page, orientation: "portrait" as const },
    labels: { ...template.templateSchema.labels, documentTitle: undefined },
  };
  const html = renderDocumentShell({
    branding,
    template: schema,
    title: options.title ?? (reports.length === 1 ? "Z-report" : "Z-reports"),
    subtitle:
      options.subtitle ??
      (reports.length === 1
        ? reports[0]!.reportNo
        : `${reports.length} reports, ${reports[0]!.businessDate} to ${reports[reports.length - 1]!.businessDate}`),
    content: zReportsHtml(reports),
    css: Z_REPORT_CSS,
  });
  return renderPdfFromHtml({ html, template: schema });
}
