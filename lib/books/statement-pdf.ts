import { getDocumentBranding } from "@/lib/documents/branding-snapshot";
import { esc, renderDocumentShell } from "@/lib/documents/html-renderer";
import { renderPdfFromHtml } from "@/lib/documents/pdf-renderer";
import { resolveTemplate } from "@/lib/documents/template-resolver";

import type { CustomerView } from "./customers-view";
import { money, shortDay } from "./format";

const STATEMENT_CSS = `
  .st-head { margin: 0 0 14px; color: var(--ink-muted); font-size: 11px; }
  .st-table { width: 100%; border-collapse: collapse; font-size: 11px; }
  .st-table td, .st-table th { padding: 5px 0; border-bottom: 1px solid var(--rule); text-align: left; }
  .st-table th { color: var(--ink-muted); font-weight: 500; }
  .st-table .num { text-align: right; white-space: nowrap; }
  .st-table .muted { color: var(--ink-muted); }
  .st-table tr.close td { font-weight: 600; border-bottom: 0; padding-top: 8px; }
`;

/** One customer's statement for the period read, as a PDF the person downloads. */
export async function customerStatementPdf(companyId: string, customer: CustomerView): Promise<Buffer> {
  const [template, branding] = await Promise.all([
    resolveTemplate({ companyId, documentType: "REPORT_TABLE", targetType: "LIST", sourceKey: "ui.table.reports.retail-z-reports" }),
    getDocumentBranding(companyId),
  ]);
  const schema = {
    ...template.templateSchema,
    page: { ...template.templateSchema.page, orientation: "portrait" as const },
    labels: { ...template.templateSchema.labels, documentTitle: undefined },
  };
  const { statement, currency } = customer;
  const cell = (value: number | null) => (value === null ? "" : esc(money(value, currency)));
  const rows = [
    `<tr><td class="muted">${esc(shortDay(statement.from))}</td><td class="muted">Opening balance</td><td></td><td class="num"></td><td class="num"></td><td class="num">${cell(statement.opening)}</td></tr>`,
    ...statement.lines.map(
      (line) =>
        `<tr><td class="muted">${esc(line.date)}</td><td>${esc(line.what)}</td><td>${esc(line.document)}</td><td class="num">${cell(line.invoiced)}</td><td class="num">${cell(line.paid)}</td><td class="num">${cell(line.balance)}</td></tr>`,
    ),
    `<tr class="close"><td></td><td>Closing balance</td><td></td><td class="num">${cell(statement.invoiced)}</td><td class="num">${cell(statement.paid)}</td><td class="num">${cell(statement.closing)}</td></tr>`,
  ].join("");
  const content = `
    <p class="st-head">${esc(shortDay(statement.from))} to ${esc(shortDay(statement.to))}${customer.contact.address ? ` · ${esc(customer.contact.address)}` : ""}</p>
    <table class="st-table">
      <thead><tr><th>Date</th><th>What</th><th>Number</th><th class="num">Charged</th><th class="num">Paid</th><th class="num">Balance, ${esc(currency)}</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  const html = renderDocumentShell({ branding, template: schema, title: `Statement for ${customer.name}`, subtitle: customer.code, content, css: STATEMENT_CSS });
  return renderPdfFromHtml({ html, template: schema });
}

export function statementFileName(customer: Pick<CustomerView, "name" | "statement">): string {
  const slug = customer.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "customer";
  return `statement-${slug}-${customer.statement.to}.pdf`;
}
