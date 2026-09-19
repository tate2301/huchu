import { buildPaymentRows } from "@/lib/documents/payment-details";
import type { DocumentTemplateSchema } from "@/lib/documents/template-schema";
import type {
  CompanyBrandingSnapshot,
  DocumentBadgeTone,
  DocumentMeta,
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

const DEFAULT_ACCENT = "#4b5563";

/** `#abc` and `#aabbcc` to channels. Null for anything else, including named colours. */
function parseHex(value: string | null | undefined): [number, number, number] | null {
  const raw = (value ?? "").trim().replace(/^#/, "");
  const full = raw.length === 3 ? raw.replace(/./g, (c) => c + c) : raw;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  return [
    Number.parseInt(full.slice(0, 2), 16),
    Number.parseInt(full.slice(2, 4), 16),
    Number.parseInt(full.slice(4, 6), 16),
  ];
}

/**
 * A tint of the brand colour, for the surfaces the accent only washes rather
 * than fills. Falls back to the colour itself when it is not a hex a tenant
 * can be tinted from, so a named or `rgb()` brand colour still prints.
 */
function tint(value: string, alpha: number): string {
  const rgb = parseHex(value);
  if (!rgb) return value;
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

/**
 * Ink that stays legible on the brand colour. A tenant whose brand is a pale
 * yellow gets dark text on its logo tile rather than white on white.
 */
function inkOn(value: string): string {
  const rgb = parseHex(value);
  if (!rgb) return "#ffffff";
  const [r, g, b] = rgb.map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.55 ? "#18181b" : "#ffffff";
}

/** Up to two initials, for the tile a tenant with no logo gets instead. */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "•";
  const letters = words.slice(0, 2).map((word) => word[0]?.toUpperCase() ?? "");
  return letters.join("") || "•";
}

/**
 * A line item's name and its elaboration.
 *
 * The mock sets the item name in ink with a grey description under it, and a
 * line's `description` is the only text we hold. Where a rep has written more
 * than one line of it, the first is the name and the rest is the detail; where
 * they have written one, there is simply no detail.
 */
function splitItemText(value: unknown): { name: string; detail: string } {
  const text = String(value ?? "");
  const newline = text.indexOf("\n");
  if (newline === -1) return { name: text, detail: "" };
  return {
    name: text.slice(0, newline).trim(),
    detail: text.slice(newline + 1).trim(),
  };
}

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

  // The item column carries a name over a description only on a document whose
  // lines are a bill. A report table's first column is just a cell.
  const itemKey = !list && lineRows?.length ? keys[0] : null;

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
          if (key === itemKey) {
            const { name, detail } = splitItemText(row[key]);
            return `<td class="align-${esc(align)} item-cell"><div class="item-name">${esc(name)}</div>${
              detail ? `<div class="item-detail">${esc(detail)}</div>` : ""
            }</td>`;
          }
          return `<td class="align-${esc(align)}${mono ? " mono" : ""}">${esc(row[key])}</td>`;
        })
        .join("");
      const zebraClass = schema.table.zebra && rowIndex % 2 === 1 ? " zebra" : "";
      return `<tr class="row${zebraClass}">${cells}</tr>`;
    })
    .join("");

  return `<table class="${schema.table.compact ? "compact" : ""}"><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table>`;
}

type SummaryColumn = { title: string; lines: string[]; lead?: boolean };

const NUMBER_META = /\b(no\.?|number|ref(erence)?|#)\b/i;
const DATE_META = /\b(date|issued|generated|raised)\b/i;
const PAYMENT_META = /\b(due|valid|terms|payable)\b/i;

/**
 * A meta row worth printing.
 *
 * `isoDate(null)` renders "-", so a quotation with no expiry printed
 * "Valid Until: -" in the payment column — a field announcing its own
 * emptiness. A row with nothing to say is left out instead.
 */
function hasValue(item: DocumentMeta): boolean {
  const value = item.value.trim();
  return value.length > 0 && value !== "-" && value !== "—";
}

/**
 * The document's identifying pair — its number and its date — which the header
 * states opposite the logo, exactly as the reference does.
 */
function pickHeaderMeta(meta: DocumentMeta[]): { header: DocumentMeta[]; rest: DocumentMeta[] } {
  const remaining = [...meta];
  const take = (test: RegExp) => {
    const index = remaining.findIndex((item) => test.test(item.label));
    return index === -1 ? null : remaining.splice(index, 1)[0];
  };

  const number = take(NUMBER_META);
  const date = take(DATE_META);
  const header = [number, date].filter((item): item is DocumentMeta => Boolean(item));
  // Nothing matched the shapes above — a report's meta is "Rows" and totals —
  // so the header stays bare rather than promoting an arbitrary pair.
  return { header, rest: remaining };
}

/**
 * Bill To / Details / Payment — the three-column band under the title.
 *
 * Built from what the payload already carries rather than from new fields:
 * the parties become the addressed columns, the leftover meta becomes the
 * details, and the money owed plus its date becomes the payment column. A
 * document with none of those (a report table) gets no band at all.
 */
function buildSummaryColumns(
  payload: UniversalDocumentPayload,
  rest: DocumentMeta[],
): SummaryColumn[] {
  const columns: SummaryColumn[] = (payload.parties ?? [])
    .filter((party) => party.lines.filter(Boolean).length > 0)
    .map((party) => ({
      title: party.title,
      lines: party.lines.filter(Boolean),
      lead: true,
    }));

  const present = rest.filter(hasValue);
  const paymentMeta = present.filter((item) => PAYMENT_META.test(item.label));
  const detailMeta = present.filter((item) => !PAYMENT_META.test(item.label));

  if (detailMeta.length > 0) {
    columns.push({
      title: "Details",
      lines: detailMeta.map((item) => `${item.label}: ${item.value}`),
    });
  }

  // What is owed, and by when. The emphasised totals row is the figure the
  // document is really about — the balance due on an invoice, the total on a
  // quotation — so it is the one repeated up here.
  const headline = (payload.totals ?? []).filter((row) => row.emphasis).at(-1);
  const paymentLines = [
    ...paymentMeta.map((item) => `${item.label}: ${item.value}`),
    ...(headline ? [`${headline.label}: ${headline.value}`] : []),
  ];
  if (paymentLines.length > 0) {
    columns.push({ title: "Payment", lines: paymentLines });
  }

  return columns;
}

function renderSummaryBand(columns: SummaryColumn[]): string {
  if (columns.length === 0) return "";
  const blocks = columns
    .map(
      (column) => `
      <div class="summary-col">
        <div class="summary-title">${esc(column.title)}</div>
        ${column.lines
          .map(
            (line, index) =>
              `<div class="summary-line${column.lead && index === 0 ? " summary-lead" : ""}">${esc(line)}</div>`,
          )
          .join("")}
      </div>`,
    )
    .join("");
  return `<section class="summary">${blocks}</section>`;
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

/**
 * The masthead: a logo tile, then who is sending this.
 *
 * The tile is the tenant's logo where there is one and a brand-coloured square
 * of initials where there is not, so a workspace that has never uploaded a
 * logo still gets a document with a mark on it rather than a gap.
 */
function buildMasthead(branding: CompanyBrandingSnapshot, schema: DocumentTemplateSchema, accent: string): string {
  const registeredName = branding.legalName || branding.displayName;
  const identityLines = schema.header.showCompanyIdentity
    ? [
        // Compared against the line actually printed above, not against
        // `displayName`. A tenant whose display name is its trading name --
        // which is the usual case -- still has to show "t/a" under its
        // registered name, and only the tautology "Foo t/a Foo" is suppressed.
        branding.tradingName && branding.tradingName !== registeredName
          ? `t/a ${branding.tradingName}`
          : null,
        branding.registrationNumber ? `Reg No. ${branding.registrationNumber}` : null,
        branding.vatNumber ? `VAT ${branding.vatNumber}` : branding.taxNumber ? `Tax ${branding.taxNumber}` : null,
      ].filter(Boolean)
    : [];
  // The address on its own line, then every way to reach them on one more.
  // Stacked one per line the block ran seven deep and pushed the title a third
  // of the way down the page; the reference gives the sender two lines.
  const contactLines = schema.header.showContactBlock
    ? [
        branding.physicalAddress,
        [branding.phone, branding.email, branding.website].filter(Boolean).join(" · "),
      ].filter(Boolean)
    : [];

  const marks: string[] = [];
  if (schema.header.showLogo) {
    marks.push(
      branding.logoUrl
        ? `<img class="logo" src="${esc(branding.logoUrl)}" alt="${esc(branding.displayName)}" />`
        : `<div class="logo-tile" style="background:${esc(accent)};color:${inkOn(accent)}">${esc(initials(branding.displayName))}</div>`,
    );
  }
  if (schema.header.showSecondaryLogo && branding.secondaryLogoUrl) {
    marks.push(`<img class="logo" src="${esc(branding.secondaryLogoUrl)}" alt="Secondary logo" />`);
  }

  const identity = schema.header.showCompanyIdentity
    ? `<div class="issuer-name">${esc(registeredName)}</div>`
    : "";

  if (marks.length === 0 && !identity && contactLines.length === 0) return "";

  return `<div class="masthead">
    ${marks.join("")}
    <div class="issuer">
      ${identity}
      ${identityLines.map((line) => `<div class="issuer-line">${esc(line)}</div>`).join("")}
      ${contactLines.map((line) => `<div class="issuer-line">${esc(line)}</div>`).join("")}
    </div>
  </div>`;
}

function buildFooter(branding: CompanyBrandingSnapshot, schema: DocumentTemplateSchema): string {
  const columns: string[] = [];

  if (schema.footer.showPaymentDetails) {
    // Shared with the public approval page, so the two cannot drift.
    const presentRows = buildPaymentRows(branding);
    if (presentRows.length > 0) {
      columns.push(`<div class="footer-col">
        <div class="footer-title">Payment details</div>
        ${presentRows.map(({ label, value }) => `<div class="footer-kv"><span>${esc(label)}</span><span class="mono">${esc(value)}</span></div>`).join("")}
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
  const accent = branding.primaryColor || DEFAULT_ACCENT;
  const margin = template.page.marginMm;
  // A stack of real families. `branding.fontFamily` is resolved for documents
  // in the snapshot precisely so no `var()` reaches this string: one that does
  // not resolve here invalidates the declaration and the whole document prints
  // in the browser's default face, whatever the tenant chose.
  const fontFamily =
    branding.fontFamily || '"Inter", "Segoe UI", "Helvetica Neue", Arial, sans-serif';
  const monoFontFamily =
    branding.monoFontFamily ||
    '"Atkinson Hyperlegible Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  // Fetched by the renderer before it prints. Without it the container has
  // almost no fonts installed and the stack falls through to a default.
  const fontImport = branding.fontImportUrl
    ? `@import url("${esc(branding.fontImportUrl)}");`
    : "";

  const badge = payload.badge
    ? (() => {
        const tone = BADGE_TONES[payload.badge.tone] ?? BADGE_TONES.neutral;
        return `<span class="badge" style="color:${tone.fg};border-color:${tone.border}">${esc(payload.badge.label)}</span>`;
      })()
    : "";

  const { header: headerMeta, rest: bodyMeta } = pickHeaderMeta(payload.meta ?? []);
  const headerMetaHtml = headerMeta
    .filter(hasValue)
    .map(
      (item) =>
        `<div class="stamp-item"><div class="stamp-label">${esc(item.label)}</div><div class="stamp-value mono">${esc(item.value)}</div></div>`,
    )
    .join("");

  const summary = renderSummaryBand(buildSummaryColumns(payload, bodyMeta));

  // On a financial document the subtitle IS the number, which the header
  // already states opposite the logo. Printing it twice under the title reads
  // as a mistake, so it is shown only when it says something else.
  const subtitle =
    payload.subtitle && !headerMeta.some((item) => item.value === payload.subtitle)
      ? payload.subtitle
      : null;

  const content = [
    summary,
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
    ${fontImport}
    /*
     * A document, not a web page — laid out after the reference invoice: a
     * quiet masthead row, one heavy brand rule under it, the title set large,
     * a three-column Bill To / Details / Payment band on hairlines, then the
     * items and the answer. Every colour on the page is the tenant's brand
     * colour or grey; nothing else is tinted, so a tenant's document looks
     * like theirs rather than like ours.
     */
    @page { size: ${template.page.size} ${template.page.orientation}; margin: ${margin}mm; }
    * { box-sizing: border-box; }
    :root {
      --accent: ${esc(accent)};
      --accent-wash: ${esc(tint(accent, 0.07))};
      --ink: #18181b;
      --ink-soft: #3f3f46;
      --ink-muted: #71717a;
      --rule: #e4e4e7;
    }
    body { margin: 0; color: var(--ink); font-family: ${fontFamily}; font-size: 11px; line-height: 1.55; -webkit-print-color-adjust: exact; print-color-adjust: exact; font-feature-settings: "kern", "liga"; }
    .mono { font-family: ${monoFontFamily}; font-size: 0.95em; font-variant-numeric: tabular-nums; }
    .muted { color: var(--ink-muted); }

    /* ── Masthead: mark and issuer left, number and date right ── */
    .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 32px; }
    .masthead { display: flex; align-items: flex-start; gap: 12px; }
    .logo { max-height: 52px; max-width: 132px; object-fit: contain; }
    .logo-tile { width: 52px; height: 52px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 17px; font-weight: 700; letter-spacing: 0.02em; flex: none; }
    .issuer { padding-top: 1px; max-width: 300px; }
    .issuer-name { font-weight: 700; font-size: 12px; }
    .issuer-line { font-size: 10px; color: var(--ink-muted); }
    .doc-stamp { text-align: right; display: flex; flex-direction: column; gap: 6px; }
    .stamp-label { font-size: 8.5px; text-transform: uppercase; letter-spacing: 0.12em; color: var(--ink-muted); font-weight: 600; }
    .stamp-value { font-size: 11.5px; font-weight: 600; color: var(--ink); }

    /* ── The one heavy rule the reference hangs everything off ── */
    .brand-rule { height: 5px; background: var(--accent); margin: 14px 0 22px; border-radius: 2px; }

    /* ── Title block ─────────────────────────────────────────── */
    .title-row { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
    .doc-title { margin: 0; font-size: 27px; font-weight: 700; letter-spacing: -0.02em; color: var(--ink); }
    .doc-subtitle { margin-top: 2px; font-size: 12px; color: var(--ink-muted); }
    .badge { display: inline-block; border: 1px solid; padding: 1px 8px; border-radius: 3px; font-size: 8.5px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; }

    /* ── Bill To / Details / Payment ─────────────────────────── */
    .summary { display: flex; gap: 32px; margin-top: 34px; }
    .summary-col { flex: 1 1 0; min-width: 0; border-top: 1px solid var(--rule); padding-top: 9px; }
    .summary-title { font-size: 8.5px; text-transform: uppercase; letter-spacing: 0.12em; color: var(--ink-muted); font-weight: 700; margin-bottom: 6px; }
    .summary-line { color: var(--ink-soft); }
    .summary-lead { font-weight: 600; color: var(--ink); }

    /* ── Key/value sections (record exports) ────────────────── */
    .kv-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px 40px; margin-top: 22px; }
    .kv-card { padding: 9px 0; border-top: 1px solid var(--rule); }
    .kv-card h3 { margin: 0 0 6px; font-size: 8.5px; text-transform: uppercase; letter-spacing: 0.12em; color: var(--ink-muted); font-weight: 700; }
    .kv-row { display: grid; grid-template-columns: 130px 1fr; gap: 12px; padding: 1.5px 0; }
    .kv-label { color: var(--ink-muted); }
    .kv-value { font-weight: 500; }

    /* ── Dashboard metrics ──────────────────────────────────── */
    .metric-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0 28px; margin-top: 22px; }
    .metric { padding: 9px 0; border-top: 1px solid var(--rule); }
    .metric-label { color: var(--ink-muted); font-size: 8.5px; text-transform: uppercase; letter-spacing: 0.12em; font-weight: 700; }
    .metric-value { margin-top: 4px; font-size: 18px; font-weight: 600; letter-spacing: -0.01em; }
    .metric-detail { margin-top: 2px; color: var(--ink-muted); font-size: 10px; }
    .dashboard-notes { margin: 10px 0 0 16px; color: var(--ink-soft); }

    /* ── Line items: airy rows on hairlines, no filled header ── */
    table { width: 100%; border-collapse: collapse; margin-top: 30px; }
    th { text-align: left; font-size: 8.5px; text-transform: uppercase; letter-spacing: 0.12em; color: var(--ink-muted); font-weight: 700; padding: 0 10px 9px; border-bottom: 1px solid var(--rule); }
    th:first-child { padding-left: 0; }
    th:last-child { padding-right: 0; }
    td { border-bottom: 1px solid var(--rule); padding: 12px 10px; vertical-align: top; color: var(--ink-soft); }
    td:first-child { padding-left: 0; }
    td:last-child { padding-right: 0; }
    table.compact td { padding-top: 6px; padding-bottom: 6px; }
    .item-name { color: var(--ink); font-weight: 500; }
    .item-detail { margin-top: 2px; color: var(--ink-muted); font-size: 10px; }
    .zebra td { background: transparent; }
    .align-left { text-align: left; }
    .align-center { text-align: center; }
    .align-right { text-align: right; }

    /* ── Totals ─────────────────────────────────────────────── */
    .totals-wrap { display: flex; justify-content: flex-end; margin-top: 14px; }
    .totals { width: 290px; }
    .totals-row { display: flex; justify-content: space-between; gap: 24px; padding: 4px 0; color: var(--ink-soft); }
    .totals-value { font-variant-numeric: tabular-nums; }
    .totals-emphasis { margin-top: 6px; padding: 11px 0 0; border-top: 1px solid var(--rule); }
    .totals-emphasis .totals-label { color: var(--ink); font-weight: 700; font-size: 13px; }
    .totals-emphasis .totals-value { color: var(--ink); font-size: 15px; font-weight: 700; }

    /* ── Notes ──────────────────────────────────────────────── */
    .notes-block { margin-top: 30px; border-left: 2px solid var(--accent); background: var(--accent-wash); padding: 9px 12px; border-radius: 0 4px 4px 0; }
    .notes-title { font-size: 8.5px; text-transform: uppercase; letter-spacing: 0.12em; color: var(--ink-muted); font-weight: 700; margin-bottom: 3px; }
    .notes-line { color: var(--ink-soft); font-size: 10.5px; }

    /* ── Footer: fine print ─────────────────────────────────── */
    .footer { margin-top: 38px; border-top: 1px solid var(--rule); padding-top: 12px; color: var(--ink-muted); }
    .footer-grid { display: flex; justify-content: space-between; gap: 24px; margin-bottom: 8px; }
    .footer-col { flex: 0 1 auto; min-width: 190px; max-width: 300px; }
    .footer-title { font-size: 8.5px; text-transform: uppercase; letter-spacing: 0.12em; color: var(--ink-muted); font-weight: 700; margin-bottom: 4px; }
    .footer-kv { display: flex; justify-content: space-between; gap: 16px; padding: 1px 0; font-size: 10px; }
    .footer-kv span:first-child { color: var(--ink-muted); }
    .footer-sign { display: flex; align-items: flex-end; gap: 14px; }
    .signature { max-height: 40px; max-width: 150px; object-fit: contain; }
    .sig-caption { border-top: 1px solid #a1a1aa; margin-top: 4px; padding-top: 2px; font-size: 8.5px; color: var(--ink-muted); text-align: center; letter-spacing: 0.06em; }
    .stamp { max-height: 60px; max-width: 100px; object-fit: contain; opacity: 0.85; }
    .footer-text { font-size: 10px; margin-top: 4px; }
    .footer-disclaimer { font-size: 8.5px; color: #a1a1aa; margin-top: 6px; }
  </style>
</head>
<body>
  <div class="doc">
    <header class="header">
      ${buildMasthead(branding, template, accent)}
      ${headerMetaHtml ? `<div class="doc-stamp">${headerMetaHtml}</div>` : ""}
    </header>
    <div class="brand-rule"></div>
    <div class="title-block">
      <div class="title-row">
        <h1 class="doc-title">${esc(template.labels.documentTitle || payload.title)}</h1>
        ${badge}
      </div>
      ${subtitle ? `<div class="doc-subtitle mono">${esc(subtitle)}</div>` : ""}
    </div>
    <main class="content">${content}</main>
    <footer class="footer">${buildFooter(branding, template)}</footer>
  </div>
</body>
</html>`;
}
