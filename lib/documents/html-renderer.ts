import type { DocumentTemplateSchema } from "@/lib/documents/template-schema";
import type { CompanyBrandingSnapshot, UniversalDocumentPayload } from "@/lib/documents/types";

function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildTable(payload: UniversalDocumentPayload, schema: DocumentTemplateSchema): string {
  const list = payload.list;
  const lineRows = payload.record?.lines;
  const sourceRows = list?.rows ?? lineRows ?? [];
  if (!sourceRows || sourceRows.length === 0) {
    return "<p class=\"muted\">No rows available.</p>";
  }

  const keys =
    list?.columns?.map((column) => column.key) ??
    payload.record?.lineColumns?.map((column) => column.key) ??
    Object.keys(sourceRows[0]);

  const labels =
    list?.columns?.reduce<Record<string, string>>((acc, column) => {
      acc[column.key] = column.label;
      return acc;
    }, {}) ??
    payload.record?.lineColumns?.reduce<Record<string, string>>((acc, column) => {
      acc[column.key] = column.label;
      return acc;
    }, {}) ??
    {};

  const alignMap = schema.table.columns.reduce<Record<string, string>>((acc, column) => {
    acc[column.key] = column.align ?? "left";
    return acc;
  }, {});

  const monoMap = schema.table.columns.reduce<Record<string, boolean>>((acc, column) => {
    acc[column.key] = column.mono === true;
    return acc;
  }, {});

  const header = keys.map((key) => `<th>${esc(labels[key] ?? key)}</th>`).join("");

  const body = sourceRows
    .map((row, rowIndex) => {
      const cells = keys
        .map((key) => {
          const align = alignMap[key] ?? "left";
          const monoClass = monoMap[key] ? " mono" : "";
          return `<td class=\"align-${esc(align)}${monoClass}\">${esc(row[key])}</td>`;
        })
        .join("");

      const zebraClass = schema.table.zebra && rowIndex % 2 === 1 ? " zebra" : "";
      return `<tr class=\"row${zebraClass}\">${cells}</tr>`;
    })
    .join("");

  return `<table><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table>`;
}

function buildRecordSections(payload: UniversalDocumentPayload): string {
  const sections = payload.record?.sections ?? [];
  if (sections.length === 0) return "";

  return sections
    .map((section) => {
      const rows = section.rows
        .map(
          (row) =>
            `<div class=\"kv-row\"><div class=\"kv-label\">${esc(row.label)}</div><div class=\"kv-value\">${esc(row.value)}</div></div>`,
        )
        .join("");
      return `<section class=\"card\"><h3>${esc(section.title)}</h3>${rows}</section>`;
    })
    .join("");
}

function buildDashboard(payload: UniversalDocumentPayload): string {
  const dashboard = payload.dashboard;
  if (!dashboard) return "";
  const metrics = dashboard.metrics
    .map(
      (metric) =>
        `<section class=\"metric\"><div class=\"metric-label\">${esc(metric.label)}</div><div class=\"metric-value mono\">${esc(metric.value)}</div>${metric.detail ? `<div class=\"metric-detail\">${esc(metric.detail)}</div>` : ""}</section>`,
    )
    .join("");
  const notes = (dashboard.notes ?? []).map((note) => `<li>${esc(note)}</li>`).join("");
  return `<div class=\"metric-grid\">${metrics}</div>${notes ? `<ul class=\"notes\">${notes}</ul>` : ""}`;
}

function buildBrandingBlock(branding: CompanyBrandingSnapshot): string {
  const lines = [
    branding.legalName || branding.displayName,
    branding.tradingName,
    branding.registrationNumber ? `Reg: ${branding.registrationNumber}` : null,
    branding.taxNumber ? `Tax: ${branding.taxNumber}` : null,
    branding.vatNumber ? `VAT: ${branding.vatNumber}` : null,
    branding.physicalAddress,
    branding.email,
    branding.phone,
    branding.website,
  ].filter(Boolean);

  const details = lines.map((line) => `<div>${esc(line)}</div>`).join("");
  return `<div class=\"branding-details\">${details}</div>`;
}

function buildFooter(branding: CompanyBrandingSnapshot, schema: DocumentTemplateSchema): string {
  const blocks: string[] = [];

  if (schema.footer.showPaymentDetails) {
    const paymentDetails = [
      branding.bankName,
      branding.bankAccountName,
      branding.bankAccountNumber,
      branding.bankSwiftCode,
      branding.bankIban,
    ].filter(Boolean);
    if (paymentDetails.length > 0) {
      blocks.push(`<div><strong>Payment details:</strong> ${esc(paymentDetails.join(" | "))}</div>`);
    }
  }

  if (schema.footer.showFooterText && branding.defaultFooterText) {
    blocks.push(`<div>${esc(branding.defaultFooterText)}</div>`);
  }

  if (schema.footer.showDisclaimer && branding.legalDisclaimer) {
    blocks.push(`<div class=\"muted\">${esc(branding.legalDisclaimer)}</div>`);
  }

  if (schema.footer.showSignature && branding.signatureUrl) {
    blocks.push(`<div><img src=\"${esc(branding.signatureUrl)}\" class=\"signature\" alt=\"Signature\" /></div>`);
  }

  if (schema.footer.showStamp && branding.stampUrl) {
    blocks.push(`<div><img src=\"${esc(branding.stampUrl)}\" class=\"stamp\" alt=\"Stamp\" /></div>`);
  }

  return blocks.join("");
}

export function renderDocumentHtml(input: {
  payload: UniversalDocumentPayload;
  branding: CompanyBrandingSnapshot;
  template: DocumentTemplateSchema;
}): string {
  const { payload, branding, template } = input;
  const primary = branding.primaryColor || "#0f8f86";
  const secondary = branding.secondaryColor || "#f4f8f7";
  const accent = branding.accentColor || "#e9f3f2";
  const margin = template.page.marginMm;
  const fontFamily = branding.fontFamily || "'Segoe UI', Arial, sans-serif";

  const meta = (payload.meta ?? [])
    .map((item) => `<div class=\"meta-item\"><div class=\"meta-label\">${esc(item.label)}</div><div class=\"meta-value mono\">${esc(item.value)}</div></div>`)
    .join("");

  const content = [
    buildRecordSections(payload),
    buildDashboard(payload),
    buildTable(payload, template),
  ]
    .filter(Boolean)
    .join("");

  return `<!doctype html>
<html>
<head>
  <meta charset=\"utf-8\" />
  <style>
    @page { size: ${template.page.size} ${template.page.orientation}; margin: ${margin}mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #111827; font-family: ${fontFamily}; font-size: 12px; }
    .doc { width: 100%; }
    .header { display: flex; justify-content: space-between; gap: 14px; border-bottom: 2px solid ${esc(primary)}; padding-bottom: 8px; }
    .identity h1 { margin: 0; font-size: 21px; }
    .identity .subtitle { margin-top: 4px; color: #4b5563; }
    .branding-details { text-align: right; line-height: 1.4; }
    .logos { display: flex; gap: 8px; align-items: center; }
    .logos img { max-height: 48px; max-width: 140px; object-fit: contain; }
    .meta-grid { margin-top: 10px; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
    .meta-item { border: 1px solid #d1d5db; background: ${esc(secondary)}; padding: 6px; border-radius: 4px; }
    .meta-label { font-size: 10px; text-transform: uppercase; color: #6b7280; }
    .meta-value { margin-top: 2px; font-weight: 700; }
    .content { margin-top: 12px; }
    .card { border: 1px solid #d1d5db; border-radius: 4px; padding: 8px; margin-bottom: 10px; background: ${esc(accent)}; }
    .card h3 { margin: 0 0 6px; font-size: 13px; }
    .kv-row { display: grid; grid-template-columns: 180px 1fr; gap: 10px; padding: 2px 0; }
    .kv-label { color: #4b5563; }
    .kv-value { font-weight: 600; }
    .metric-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-bottom: 10px; }
    .metric { border: 1px solid #d1d5db; border-radius: 4px; padding: 8px; }
    .metric-label { color: #4b5563; font-size: 11px; }
    .metric-value { margin-top: 4px; font-size: 16px; font-weight: 700; }
    .metric-detail { margin-top: 3px; color: #6b7280; }
    .notes { margin: 8px 0 12px 18px; color: #374151; }
    table { width: 100%; border-collapse: collapse; margin-top: 4px; }
    th { text-align: left; font-size: 11px; background: ${esc(secondary)}; border-bottom: 1px solid #9ca3af; padding: 7px 6px; }
    td { border-bottom: 1px solid #e5e7eb; padding: 6px; vertical-align: top; }
    .zebra td { background: #fafafa; }
    .align-left { text-align: left; }
    .align-center { text-align: center; }
    .align-right { text-align: right; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    .footer { margin-top: 14px; border-top: 1px solid #d1d5db; padding-top: 8px; color: #374151; line-height: 1.4; }
    .muted { color: #6b7280; }
    .signature { max-height: 42px; max-width: 160px; object-fit: contain; }
    .stamp { max-height: 70px; max-width: 120px; object-fit: contain; }
  </style>
</head>
<body>
  <div class=\"doc\">
    <header class=\"header\">
      <div>
        <div class=\"logos\">
          ${template.header.showLogo && branding.logoUrl ? `<img src=\"${esc(branding.logoUrl)}\" alt=\"Company logo\" />` : ""}
          ${template.header.showSecondaryLogo && branding.secondaryLogoUrl ? `<img src=\"${esc(branding.secondaryLogoUrl)}\" alt=\"Secondary logo\" />` : ""}
        </div>
        <div class=\"identity\">
          <h1>${esc(template.labels.documentTitle || payload.title)}</h1>
          ${payload.subtitle ? `<div class=\"subtitle\">${esc(payload.subtitle)}</div>` : ""}
        </div>
      </div>
      ${template.header.showCompanyIdentity || template.header.showContactBlock ? buildBrandingBlock(branding) : ""}
    </header>
    ${meta ? `<section class=\"meta-grid\">${meta}</section>` : ""}
    <main class=\"content\">${content}</main>
    <footer class=\"footer\">${buildFooter(branding, template)}</footer>
  </div>
</body>
</html>`;
}
