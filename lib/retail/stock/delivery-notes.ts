import { getDocumentBranding } from "@/lib/documents/branding-snapshot";
import { esc, renderDocumentShell } from "@/lib/documents/html-renderer";
import { renderPdfFromHtml } from "@/lib/documents/pdf-renderer";
import { resolveTemplate } from "@/lib/documents/template-resolver";
import { prisma } from "@/lib/prisma";
import { formatCount, formatDay, formatTime } from "@/lib/workspace/format";

/**
 * Delivery notes (30-stock 4.5): the paper that travels with a transfer. One
 * per transfer, one per page: its number, where from and to, when and by whom
 * it was sent, who drives it in what, every line with what was sent and what
 * has been received, and a line for each side to sign.
 */

export type DeliveryNote = {
  id: string;
  transferNo: string;
  from: string;
  to: string;
  sentAt: Date;
  sentBy: string;
  driver: string | null;
  vehicle: string | null;
  arrives: string | null;
  note: string | null;
  received: boolean;
  lines: Array<{ product: string; unit: string; sent: number; received: number }>;
};

/** The company's transfers among `ids`, in number order; ids that are not its own are left out. */
export async function loadDeliveryNotes(companyId: string, ids: string[]): Promise<DeliveryNote[]> {
  const transfers = await prisma.retailStockTransfer.findMany({
    where: { companyId, id: { in: ids } },
    orderBy: { transferNo: "asc" },
    select: {
      id: true,
      transferNo: true,
      status: true,
      sentAt: true,
      driver: true,
      vehicle: true,
      arrives: true,
      note: true,
      fromSite: { select: { name: true } },
      toSite: { select: { name: true } },
      sentBy: { select: { name: true } },
      lines: {
        orderBy: { createdAt: "asc" },
        select: {
          quantitySent: true,
          quantityReceived: true,
          product: { select: { name: true } },
          fromItem: { select: { unit: true } },
        },
      },
    },
  });
  return transfers.map((transfer) => ({
    id: transfer.id,
    transferNo: transfer.transferNo,
    from: transfer.fromSite.name,
    to: transfer.toSite.name,
    sentAt: transfer.sentAt,
    sentBy: transfer.sentBy.name,
    driver: transfer.driver,
    vehicle: transfer.vehicle,
    arrives: transfer.arrives,
    note: transfer.note,
    received: transfer.lines.some((line) => line.quantityReceived.greaterThan(0)),
    lines: transfer.lines.map((line) => ({
      product: line.product.name,
      unit: line.fromItem.unit,
      sent: line.quantitySent.toNumber(),
      received: line.quantityReceived.toNumber(),
    })),
  }));
}

export const DELIVERY_NOTE_CSS = `
  .dn + .dn { break-before: page; page-break-before: always; }
  .dn h2 { margin: 0 0 4px; font-size: 16px; }
  .dn-sub { margin: 0 0 14px; color: var(--ink-muted); font-size: 11px; }
  .dn-facts { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 11px; }
  .dn-facts td { padding: 3px 0; vertical-align: top; }
  .dn-facts td:first-child { color: var(--ink-muted); width: 110px; }
  .dn-lines { width: 100%; border-collapse: collapse; margin-bottom: 28px; font-size: 11px; }
  .dn-lines th, .dn-lines td { padding: 5px 0; border-bottom: 1px solid var(--rule); text-align: left; }
  .dn-lines th { color: var(--ink-muted); font-weight: 500; }
  .dn-lines .num { text-align: right; font-family: var(--font-mono, monospace); }
  .dn-lines tr.total td { font-weight: 600; border-bottom: 0; }
  .dn-sign { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; font-size: 11px; }
  .dn-sign div { border-top: 1px solid var(--ink, #222); padding-top: 6px; }
  .dn-sign span { display: block; color: var(--ink-muted); margin-top: 18px; }
`;

const dash = "—";

function noteSection(note: DeliveryNote): string {
  const facts: Array<[string, string]> = [
    ["From", note.from],
    ["To", note.to],
    ["Sent", `${formatDay(note.sentAt)}, ${formatTime(note.sentAt)}`],
    ["Sent by", note.sentBy],
    ["Driver", note.driver ?? dash],
    ["Vehicle", note.vehicle ?? dash],
    ["Arrives", note.arrives ?? dash],
    ...(note.note ? ([["Note", note.note]] as Array<[string, string]>) : []),
  ];
  const sent = note.lines.reduce((sum, line) => sum + line.sent, 0);
  const received = note.lines.reduce((sum, line) => sum + line.received, 0);
  const rows = note.lines
    .map(
      (line) =>
        `<tr><td>${esc(line.product)}</td><td class="num">${esc(formatCount(line.sent))} ${esc(line.sent === 1 ? line.unit : `${line.unit}s`)}</td><td class="num">${
          note.received ? esc(formatCount(line.received)) : dash
        }</td></tr>`,
    )
    .join("");
  return `<section class="dn">
  <h2>${esc(note.transferNo)}</h2>
  <p class="dn-sub">${esc(note.from)} to ${esc(note.to)}</p>
  <table class="dn-facts"><tbody>${facts.map(([label, value]) => `<tr><td>${esc(label)}</td><td>${esc(value)}</td></tr>`).join("")}</tbody></table>
  <table class="dn-lines">
    <thead><tr><th>Product</th><th class="num">Sent</th><th class="num">Received</th></tr></thead>
    <tbody>${rows}<tr class="total"><td>${esc(formatCount(note.lines.length))} ${note.lines.length === 1 ? "line" : "lines"}</td><td class="num">${esc(formatCount(sent))}</td><td class="num">${note.received ? esc(formatCount(received)) : dash}</td></tr></tbody>
  </table>
  <div class="dn-sign"><div>Sent by<span>Name and signature</span></div><div>Received by<span>Name and signature</span></div></div>
</section>`;
}

/** The body of the document: every note, one per page. */
export function deliveryNotesHtml(notes: DeliveryNote[]): string {
  return notes.map(noteSection).join("\n");
}

/** "TRF-0008.pdf", or "Delivery notes TRF-0006 to TRF-0008.pdf" for several. */
export function deliveryNotesFileName(notes: DeliveryNote[]): string {
  if (notes.length === 1) return `${notes[0]!.transferNo}.pdf`;
  return `Delivery notes ${notes[0]!.transferNo} to ${notes[notes.length - 1]!.transferNo}.pdf`;
}

/** The notes as one PDF, in the shop's letterhead, portrait. */
export async function renderDeliveryNotesPdf(companyId: string, notes: DeliveryNote[]): Promise<Uint8Array<ArrayBuffer>> {
  const [template, branding] = await Promise.all([
    resolveTemplate({
      companyId,
      documentType: "REPORT_TABLE",
      targetType: "LIST",
      sourceKey: "ui.table.reports.retail-stock-transfers",
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
    title: notes.length === 1 ? "Delivery note" : "Delivery notes",
    subtitle: notes.length === 1 ? null : `${formatCount(notes.length)} transfers`,
    content: deliveryNotesHtml(notes),
    css: DELIVERY_NOTE_CSS,
  });
  return new Uint8Array(await renderPdfFromHtml({ html, template: schema }));
}
