import { getDocumentBranding } from "@/lib/documents/branding-snapshot";
import { esc, renderDocumentShell } from "@/lib/documents/html-renderer";
import { renderPdfFromHtml } from "@/lib/documents/pdf-renderer";
import { resolveTemplate } from "@/lib/documents/template-resolver";
import { prisma } from "@/lib/prisma";
import { formatCount } from "@/lib/workspace/format";

/**
 * Count sheets (30-stock 4.4): the paper to count on when a phone will not
 * do. One per count, one per page: its number, name, site and counter, then
 * every line in the phone's order with its shelf or place, what is expected
 * (left blank on a blind count) and an empty box to write the figure in.
 */

export type CountSheet = {
  id: string;
  countNo: string;
  name: string;
  site: string;
  counter: string;
  blind: boolean;
  lines: Array<{ product: string; where: string; expected: number }>;
};

/** The company's counts among `ids`, in number order; ids that are not its own are left out. */
export async function loadCountSheets(companyId: string, ids: string[]): Promise<CountSheet[]> {
  const counts = await prisma.retailStockCount.findMany({
    where: { companyId, id: { in: ids } },
    orderBy: { countNo: "asc" },
    select: {
      id: true,
      countNo: true,
      name: true,
      blind: true,
      site: { select: { name: true } },
      counter: { select: { name: true } },
      lines: {
        orderBy: [{ sortKey: "asc" }, { id: "asc" }],
        select: {
          expected: true,
          inventoryItem: { select: { name: true, shelf: true, location: { select: { name: true } }, product: { select: { name: true } } } },
        },
      },
    },
  });
  return counts.map((count) => ({
    id: count.id,
    countNo: count.countNo,
    name: count.name,
    site: count.site.name,
    counter: count.counter.name,
    blind: count.blind,
    lines: count.lines.map((line) => ({
      product: line.inventoryItem.product?.name ?? line.inventoryItem.name,
      where: line.inventoryItem.shelf?.trim() || line.inventoryItem.location.name,
      expected: line.expected.toNumber(),
    })),
  }));
}

const COUNT_SHEET_CSS = `
  .cs + .cs { break-before: page; page-break-before: always; }
  .cs h2 { margin: 0 0 4px; font-size: 16px; }
  .cs-sub { margin: 0 0 14px; color: var(--ink-muted); font-size: 11px; }
  .cs-lines { width: 100%; border-collapse: collapse; font-size: 11px; }
  .cs-lines th, .cs-lines td { padding: 6px 0; border-bottom: 1px solid var(--rule); text-align: left; }
  .cs-lines th { color: var(--ink-muted); font-weight: 500; }
  .cs-lines .num { text-align: right; font-family: var(--font-mono, monospace); width: 70px; }
  .cs-lines .box { width: 80px; }
  .cs-lines .box span { display: block; margin-left: auto; width: 60px; height: 18px; border: 1px solid var(--ink, #222); border-radius: 3px; }
`;

function sheetSection(sheet: CountSheet): string {
  const rows = sheet.lines
    .map(
      (line) =>
        `<tr><td>${esc(line.product)}</td><td>${esc(line.where)}</td><td class="num">${
          sheet.blind ? "" : esc(formatCount(line.expected))
        }</td><td class="box"><span></span></td></tr>`,
    )
    .join("");
  return `<section class="cs">
  <h2>${esc(sheet.countNo)} · ${esc(sheet.name)}</h2>
  <p class="cs-sub">${esc(sheet.site)} · Counted by ${esc(sheet.counter)} · ${esc(formatCount(sheet.lines.length))} ${sheet.lines.length === 1 ? "line" : "lines"}</p>
  <table class="cs-lines">
    <thead><tr><th>Product</th><th>Shelf or place</th><th class="num">Expected</th><th class="num">Counted</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</section>`;
}

/** "CNT-0022.pdf", or "Count sheets CNT-0020 to CNT-0022.pdf" for several. */
export function countSheetsFileName(sheets: CountSheet[]): string {
  if (sheets.length === 1) return `${sheets[0]!.countNo}.pdf`;
  return `Count sheets ${sheets[0]!.countNo} to ${sheets[sheets.length - 1]!.countNo}.pdf`;
}

/** The sheets as one PDF, in the shop's letterhead, portrait. */
export async function renderCountSheetsPdf(companyId: string, sheets: CountSheet[]): Promise<Uint8Array<ArrayBuffer>> {
  const [template, branding] = await Promise.all([
    resolveTemplate({
      companyId,
      documentType: "REPORT_TABLE",
      targetType: "LIST",
      sourceKey: "ui.table.reports.retail-stock-counts",
    }),
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
    title: sheets.length === 1 ? "Count sheet" : "Count sheets",
    subtitle: sheets.length === 1 ? null : `${formatCount(sheets.length)} counts`,
    content: sheets.map(sheetSection).join("\n"),
    css: COUNT_SHEET_CSS,
  });
  return new Uint8Array(await renderPdfFromHtml({ html, template: schema }));
}
