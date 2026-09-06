import type { DocumentTemplateSchema } from "@/lib/documents/template-schema";
import type {
  CompanyBrandingSnapshot,
  DocumentBadgeTone,
  UniversalDocumentPayload,
} from "@/lib/documents/types";

function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Badge tones, restrained. A paid stamp on an invoice is set in ink, not in a
 * pastel pill: coloured text with a fine border, no fill, so it prints well on
 * a mono laser and reads as part of the document rather than of a web app.
 */
const BADGE_TONES: Record<DocumentBadgeTone, { fg: string; border: string }> = {
  positive: { fg: "#166534", border: "#166534" },
  warning: { fg: "#92400e", border: "#92400e" },
  negative: { fg: "#991b1b", border: "#991b1b" },
  neutral: { fg: "#525252", border: "#a3a3a3" },
};

function buildTable(payload: UniversalDocumentPayload, schema: DocumentTemplateSchema): string {
  const list = payload.list;
  const lineRows = payload.record?.lines;
  const sourceRows = list?.rows ?? lineRows ?? [];
  if (!sourceRows || sourceRows.length === 0) return "";

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
  // Sensible default: numeric-looking financial columns align right even when
  // the template hasn't configured explicit columns.
  const numericDefaults = new Set([
    "quantity",
    "unitPrice",
    "taxRate",
    "taxAmount",
    "lineTotal",
    "amount",
    "total",
    "subTotal",
  ]);

  const header = keys
    .map((key) => {
      const align = alignMap[key] ?? (numericDefaults.has(key) ? "right" : "left");
      return `<th class="align-${esc(align)}">${esc(labels[key] ?? key)}</th>`;
    })
    .join("");

  const body = sourceRows
    .map((row, rowIndex) => {
      const cells = keys
        .map((key) => {
          const align = alignMap[key] ?? (numericDefaults.has(key) ? "right" : "left");
          const mono = monoMap[key] || numericDefaults.has(key);
          return `<td class="align-${esc(align)}${mono ? " mono" : ""}">${esc(row[key])}</td>`;
        })
        .join("");
      const zebraClass = schema.table.zebra && rowIndex % 2 === 1 ? " zebra" : "";
      return `<tr class="row${zebraClass}">${cells}</tr>`;
    })
    .join("");

  return `<table class="${schema.table.compact ? "compact" : ""}"><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table>`;
}

function buildParties(payload: UniversalDocumentPayload): string {
  const parties = payload.parties ?? [];
  if (parties.length === 0) return "";
  const blocks = parties
    .map(
      (party) => `
      <div class="party">
        <div class="party-title">${esc(party.title)}</div>
        ${party.lines.filter(Boolean).map((line) => `<div class="party-line">${esc(line)}</div>`).join("")}
      </div>`,
    )
    .join("");
  return `<section class="parties">${blocks}</section>`;
}

function buildTotals(payload: UniversalDocumentPayload): string {
  const totals = payload.totals ?? [];
  if (totals.length === 0) return "";
  const rows = totals
    .map(
      (row) => `
      <div class="totals-row${row.emphasis ? " totals-emphasis" : ""}">
        <div class="totals-label">${esc(row.label)}</div>
        <div class="totals-value mono">${esc(row.value)}</div>
      </div>`,
    )
    .join("");
  return `<section class="totals-wrap"><div class="totals">${rows}</div></section>`;
}

function buildNotes(payload: UniversalDocumentPayload): string {
  const notes = (payload.notes ?? []).filter(Boolean);
  if (notes.length === 0) return "";
  return `<section class="notes-block">
    <div class="notes-title">Notes</div>
    ${notes.map((note) => `<div class="notes-line">${esc(note)}</div>`).join("")}
  </section>`;
}

function buildRecordSections(payload: UniversalDocumentPayload): string {
  const sections = payload.record?.sections ?? [];
  if (sections.length === 0) return "";
  return `<section class="kv-grid">${sections
    .map((section) => {
      const rows = section.rows
        .map(
          (row) =>
            `<div class="kv-row"><div class="kv-label">${esc(row.label)}</div><div class="kv-value">${esc(row.value)}</div></div>`,
        )
        .join("");
      return `<div class="kv-card"><h3>${esc(section.title)}</h3>${rows}</div>`;
    })
    .join("")}</section>`;
}

function buildDashboard(payload: UniversalDocumentPayload): string {
  const dashboard = payload.dashboard;
  if (!dashboard) return "";
  const metrics = dashboard.metrics
    .map(
      (metric) =>
        `<div class="metric"><div class="metric-label">${esc(metric.label)}</div><div class="metric-value mono">${esc(metric.value)}</div>${metric.detail ? `<div class="metric-detail">${esc(metric.detail)}</div>` : ""}</div>`,
    )
    .join("");
  const notes = (dashboard.notes ?? []).map((note) => `<li>${esc(note)}</li>`).join("");
  return `<div class="metric-grid">${metrics}</div>${notes ? `<ul class="dashboard-notes">${notes}</ul>` : ""}`;
}

function buildIdentityBlock(branding: CompanyBrandingSnapshot, schema: DocumentTemplateSchema): string {
  const identityLines = schema.header.showCompanyIdentity
    ? [
        branding.legalName || branding.displayName,
        branding.tradingName && branding.tradingName !== branding.displayName
          ? `t/a ${branding.tradingName}`
          : null,
        branding.registrationNumber ? `Reg No. ${branding.registrationNumber}` : null,
        branding.vatNumber ? `VAT ${branding.vatNumber}` : branding.taxNumber ? `Tax ${branding.taxNumber}` : null,
      ].filter(Boolean)
    : [];
  const contactLines = schema.header.showContactBlock
    ? [branding.physicalAddress, branding.phone, branding.email, branding.website].filter(Boolean)
    : [];

  if (identityLines.length === 0 && contactLines.length === 0) return "";
  return `<div class="company-block">
    ${identityLines.map((line, index) => `<div class="${index === 0 ? "company-name" : "company-line"}">${esc(line)}</div>`).join("")}
    ${contactLines.map((line) => `<div class="company-line muted">${esc(line)}</div>`).join("")}
  </div>`;
}

function buildFooter(branding: CompanyBrandingSnapshot, schema: DocumentTemplateSchema): string {
  const columns: string[] = [];

  if (schema.footer.showPaymentDetails) {
    const rows = [
      branding.bankName ? ["Bank", branding.bankName] : null,
      branding.bankAccountName ? ["Account Name", branding.bankAccountName] : null,
      branding.bankAccountNumber ? ["Account No.", branding.bankAccountNumber] : null,
      branding.bankSwiftCode ? ["SWIFT", branding.bankSwiftCode] : null,
      branding.bankIban ? ["IBAN", branding.bankIban] : null,
    ].filter((row): row is [string, string] => Boolean(row));
    if (rows.length > 0) {
      columns.push(`<div class="footer-col">
        <div class="footer-title">Payment details</div>
        ${rows.map(([label, value]) => `<div class="footer-kv"><span>${esc(label)}</span><span class="mono">${esc(value)}</span></div>`).join("")}
      </div>`);
    }
  }

  const signatureBits: string[] = [];
  if (schema.footer.showSignature && branding.signatureUrl) {
    signatureBits.push(
      `<div class="sig"><img src="${esc(branding.signatureUrl)}" class="signature" alt="Signature" /><div class="sig-caption">Authorised signature</div></div>`,
    );
  }
  if (schema.footer.showStamp && branding.stampUrl) {
    signatureBits.push(`<img src="${esc(branding.stampUrl)}" class="stamp" alt="Stamp" />`);
  }
  if (signatureBits.length > 0) {
    columns.push(`<div class="footer-col footer-sign">${signatureBits.join("")}</div>`);
  }

  const textBits: string[] = [];
  if (schema.footer.showFooterText && branding.defaultFooterText) {
    textBits.push(`<div class="footer-text">${esc(branding.defaultFooterText)}</div>`);
  }
  // Payment terms are payment language; they follow the bank block's switch so
  // a report card is not asked to quote a student number "on all payments".
  if (schema.footer.showPaymentDetails && branding.paymentTerms) {
    textBits.push(`<div class="footer-text muted">${esc(branding.paymentTerms)}</div>`);
  }
  if (schema.footer.showDisclaimer && branding.legalDisclaimer) {
    textBits.push(`<div class="footer-disclaimer">${esc(branding.legalDisclaimer)}</div>`);
  }

  return `${columns.length > 0 ? `<div class="footer-grid">${columns.join("")}</div>` : ""}${textBits.join("")}`;
}

export function renderDocumentHtml(input: {
  payload: UniversalDocumentPayload;
  branding: CompanyBrandingSnapshot;
  template: DocumentTemplateSchema;
}): string {
  const { payload, branding, template } = input;
  const primary = branding.primaryColor || "#111827";
  const margin = template.page.marginMm;
  const fontFamily =
    branding.fontFamily || "'Inter', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";

  const badge = payload.badge
    ? (() => {
        const tone = BADGE_TONES[payload.badge.tone] ?? BADGE_TONES.neutral;
        return `<span class="badge" style="color:${tone.fg};border-color:${tone.border}">${esc(payload.badge.label)}</span>`;
      })()
    : "";

  const meta = (payload.meta ?? [])
    .map(
      (item) =>
        `<div class="meta-item"><div class="meta-label">${esc(item.label)}</div><div class="meta-value">${esc(item.value)}</div></div>`,
    )
    .join("");

  const content = [
    buildParties(payload),
    buildRecordSections(payload),
    buildDashboard(payload),
    buildTable(payload, template),
    buildTotals(payload),
    buildNotes(payload),
  ]
    .filter(Boolean)
    .join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    /*
     * A document, not a web page. The old sheet borrowed app chrome — filled
     * table headers, pastel pills, boxed strips — which is what made every
     * export look like a screenshot. This one is set like print: one accent
     * used twice (title, grand total rule), hairlines for structure, small
     * caps for labels, and whitespace doing the grouping that borders did.
     */
    @page { size: ${template.page.size} ${template.page.orientation}; margin: ${margin}mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #18181b; font-family: ${fontFamily}; font-size: 11px; line-height: 1.5; -webkit-print-color-adjust: exact; print-color-adjust: exact; font-feature-settings: "kern", "liga"; }
    .mono { font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.95em; font-variant-numeric: tabular-nums; }
    .muted { color: #737373; }
    .caps { font-size: 8.5px; text-transform: uppercase; letter-spacing: 0.14em; color: #737373; font-weight: 600; }

    /* ── Header: title left, identity right, one hairline below ── */
    .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 32px; padding-bottom: 14px; border-bottom: 2px solid ${esc(primary)}; }
    .logos { display: flex; gap: 12px; align-items: center; margin-bottom: 12px; }
    .logos img { max-height: 44px; max-width: 150px; object-fit: contain; }
    .doc-title-row { display: flex; align-items: baseline; gap: 12px; }
    .doc-title { margin: 0; font-size: 21px; font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; color: #18181b; }
    .doc-subtitle { margin-top: 4px; color: #525252; font-size: 11.5px; letter-spacing: 0.02em; }
    .badge { display: inline-block; border: 1px solid; padding: 1px 8px; font-size: 8.5px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; vertical-align: 2px; }
    .company-block { text-align: right; line-height: 1.55; max-width: 46%; }
    .company-name { font-weight: 700; font-size: 12px; letter-spacing: 0.01em; }
    .company-line { font-size: 10px; color: #525252; }
    .brand-rule { display: none; }

    /* ── Meta: an open row, ruled below, no boxes ───────────── */
    .meta-grid { display: flex; flex-wrap: wrap; gap: 0 36px; padding: 10px 0; border-bottom: 1px solid #e4e4e7; }
    .meta-item { padding: 2px 0; }
    .meta-label { font-size: 8.5px; text-transform: uppercase; letter-spacing: 0.14em; color: #737373; font-weight: 600; }
    .meta-value { margin-top: 2px; font-weight: 600; font-size: 11.5px; font-variant-numeric: tabular-nums; }

    /* ── Parties ────────────────────────────────────────────── */
    .parties { display: flex; gap: 40px; margin-top: 16px; }
    .party { flex: 0 1 auto; min-width: 180px; }
    .party-title { font-size: 8.5px; text-transform: uppercase; letter-spacing: 0.14em; color: #737373; font-weight: 600; margin-bottom: 5px; }
    .party-line { line-height: 1.55; color: #3f3f46; }
    .party-line:first-of-type { font-weight: 600; font-size: 12px; color: #18181b; }

    /* ── Key/value sections (record exports) ────────────────── */
    .kv-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px 40px; margin-top: 16px; }
    .kv-card { padding: 8px 0; border-top: 1px solid #e4e4e7; }
    .kv-card h3 { margin: 0 0 6px; font-size: 8.5px; text-transform: uppercase; letter-spacing: 0.14em; color: #737373; font-weight: 600; }
    .kv-row { display: grid; grid-template-columns: 130px 1fr; gap: 12px; padding: 1.5px 0; }
    .kv-label { color: #737373; }
    .kv-value { font-weight: 500; color: #18181b; }

    /* ── Dashboard metrics ──────────────────────────────────── */
    .metric-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0 28px; margin-top: 16px; }
    .metric { padding: 8px 0; border-top: 1px solid #e4e4e7; }
    .metric-label { color: #737373; font-size: 8.5px; text-transform: uppercase; letter-spacing: 0.14em; font-weight: 600; }
    .metric-value { margin-top: 4px; font-size: 18px; font-weight: 600; letter-spacing: -0.01em; }
    .metric-detail { margin-top: 2px; color: #737373; font-size: 10px; }
    .dashboard-notes { margin: 10px 0 0 16px; color: #3f3f46; }

    /* ── Line items: ink on paper, no filled header ─────────── */
    table { width: 100%; border-collapse: collapse; margin-top: 18px; }
    th { text-align: left; font-size: 8.5px; text-transform: uppercase; letter-spacing: 0.14em; color: #52525b; font-weight: 600; padding: 0 8px 6px; border-bottom: 1.5px solid #18181b; }
    th:first-child { padding-left: 0; }
    th:last-child { padding-right: 0; }
    td { border-bottom: 1px solid #e9e9ec; padding: 7px 8px; vertical-align: top; color: #27272a; }
    td:first-child { padding-left: 0; }
    td:last-child { padding-right: 0; }
    tbody tr:last-child td { border-bottom: none; }
    table.compact td { padding-top: 4px; padding-bottom: 4px; }
    .zebra td { background: transparent; }
    .align-left { text-align: left; }
    .align-center { text-align: center; }
    .align-right { text-align: right; }

    /* ── Totals: ruled column, double rule at the answer ────── */
    .totals-wrap { display: flex; justify-content: flex-end; margin-top: 4px; }
    .totals { width: 280px; border-top: 1.5px solid #18181b; padding-top: 4px; }
    .totals-row { display: flex; justify-content: space-between; gap: 24px; padding: 3px 0; }
    .totals-label { color: #52525b; }
    .totals-value { font-weight: 500; font-variant-numeric: tabular-nums; }
    .totals-emphasis { border-top: 1px solid #18181b; border-bottom: 3px double ${esc(primary)}; margin-top: 4px; padding: 6px 0; }
    .totals-emphasis .totals-label { color: #18181b; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; font-size: 9.5px; align-self: center; }
    .totals-emphasis .totals-value { color: #18181b; font-size: 14px; font-weight: 700; }

    /* ── Notes ──────────────────────────────────────────────── */
    .notes-block { margin-top: 18px; padding-top: 8px; border-top: 1px solid #e4e4e7; }
    .notes-title { font-size: 8.5px; text-transform: uppercase; letter-spacing: 0.14em; color: #737373; font-weight: 600; margin-bottom: 3px; }
    .notes-line { color: #3f3f46; font-size: 10.5px; }

    /* ── Footer: fine print ─────────────────────────────────── */
    .footer { margin-top: 26px; border-top: 1px solid #e4e4e7; padding-top: 10px; color: #52525b; }
    .footer-grid { display: flex; justify-content: space-between; gap: 24px; margin-bottom: 8px; }
    .footer-col { min-width: 190px; }
    .footer-title { font-size: 8.5px; text-transform: uppercase; letter-spacing: 0.14em; color: #737373; font-weight: 600; margin-bottom: 4px; }
    .footer-kv { display: flex; justify-content: space-between; gap: 16px; padding: 1px 0; font-size: 10px; }
    .footer-kv span:first-child { color: #737373; }
    .footer-sign { display: flex; align-items: flex-end; gap: 14px; }
    .signature { max-height: 40px; max-width: 150px; object-fit: contain; }
    .sig-caption { border-top: 1px solid #a1a1aa; margin-top: 4px; padding-top: 2px; font-size: 8.5px; color: #737373; text-align: center; letter-spacing: 0.06em; }
    .stamp { max-height: 60px; max-width: 100px; object-fit: contain; opacity: 0.85; }
    .footer-text { font-size: 10px; margin-top: 4px; }
    .footer-disclaimer { font-size: 8.5px; color: #a1a1aa; margin-top: 6px; }
  </style>
</head>
<body>
  <div class="doc">
    <header class="header">
      <div>
        ${
          (template.header.showLogo && branding.logoUrl) ||
          (template.header.showSecondaryLogo && branding.secondaryLogoUrl)
            ? `<div class="logos">
          ${template.header.showLogo && branding.logoUrl ? `<img src="${esc(branding.logoUrl)}" alt="Company logo" />` : ""}
          ${template.header.showSecondaryLogo && branding.secondaryLogoUrl ? `<img src="${esc(branding.secondaryLogoUrl)}" alt="Secondary logo" />` : ""}
        </div>`
            : ""
        }
        <div class="doc-title-row">
          <h1 class="doc-title">${esc(template.labels.documentTitle || payload.title)}</h1>
          ${badge}
        </div>
        ${payload.subtitle ? `<div class="doc-subtitle mono">${esc(payload.subtitle)}</div>` : ""}
      </div>
      ${buildIdentityBlock(branding, template)}
    </header>
    <div class="brand-rule"></div>
    ${meta ? `<section class="meta-grid">${meta}</section>` : ""}
    <main class="content">${content}</main>
    <footer class="footer">${buildFooter(branding, template)}</footer>
  </div>
</body>
</html>`;
}
