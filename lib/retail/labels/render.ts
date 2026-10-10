import { toSVG } from "bwip-js/node";

import { esc } from "@/lib/documents/html-renderer";
import { renderPdfFromHtml } from "@/lib/documents/pdf-renderer";
import { defaultTemplateSchema } from "@/lib/documents/template-schema";

import type { Label, LabelSize, LabelSymbology } from "./data";

/**
 * Shelf labels on paper (PRD-06): a shelf strip is 38 × 21 mm and a price
 * tag 50 × 30 mm, one label a page for a label printer; an A4 sheet holds 24,
 * three across and eight down, 70 × 37 mm each. Every label has the name (two
 * lines at most), the price in mono, the was price struck through, and the
 * barcode as SVG.
 */

type Geometry = { widthMm: number; heightMm: number; padMm: number; namePt: number; pricePt: number; wasPt: number; barMm: number };

const GEOMETRY: Record<LabelSize, Geometry> = {
  STRIP: { widthMm: 38, heightMm: 21, padMm: 1.2, namePt: 7, pricePt: 16, wasPt: 7, barMm: 8 },
  TAG: { widthMm: 50, heightMm: 30, padMm: 2, namePt: 9, pricePt: 20, wasPt: 9, barMm: 10 },
  A4: { widthMm: 70, heightMm: 37, padMm: 3, namePt: 10, pricePt: 20, wasPt: 9, barMm: 11 },
};

/** Labels on an A4 sheet. */
export const A4_PER_PAGE = 24;

/** The barcode as an SVG drawing, its digits under the bars. */
export function barcodeSvg(text: string, symbology: LabelSymbology): string {
  return toSVG({
    bcid: symbology === "EAN13" ? "ean13" : "code128",
    text,
    height: 8,
    includetext: true,
    textxalign: "center",
  });
}

/** Every label as many times as it is to be printed, in order. */
export function eachCopy(labels: readonly Label[]): Label[] {
  return labels.flatMap((label) => Array.from({ length: label.copies }, () => label));
}

function cell(label: Label): string {
  const bars = label.barcode && label.symbology ? `<div class="bars">${barcodeSvg(label.barcode, label.symbology)}</div>` : "";
  const was = label.was ? `<s class="was">${esc(label.was)}</s>` : "";
  const price = label.price ? `<span class="price">${esc(label.price)}</span>` : "";
  return `<div class="label"><div class="name">${esc(label.name)}</div><div class="foot">${bars}<div class="figures">${was}${price}</div></div></div>`;
}

function css(size: LabelSize): string {
  const g = GEOMETRY[size];
  const page =
    size === "A4"
      ? `@page { size: A4; margin: 0; }
  .sheet { width: 210mm; height: 296mm; display: grid; grid-template-columns: repeat(3, ${g.widthMm}mm); grid-template-rows: repeat(8, ${g.heightMm}mm); overflow: hidden; }
  .sheet + .sheet { break-before: page; }`
      : `@page { size: ${g.widthMm}mm ${g.heightMm}mm; margin: 0; }
  .label + .label { break-before: page; }`;
  return `${page}
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; color: #000; font-family: Arial, Helvetica, sans-serif; }
  .label { width: ${g.widthMm}mm; height: ${g.heightMm}mm; padding: ${g.padMm}mm; display: flex; flex-direction: column; justify-content: space-between; overflow: hidden; }
  .name { font-size: ${g.namePt}pt; font-weight: 700; line-height: 1.15; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .foot { display: flex; align-items: flex-end; justify-content: space-between; gap: 1mm; }
  .bars { height: ${g.barMm}mm; flex: 0 1 auto; min-width: 0; }
  .bars svg { height: 100%; width: auto; max-width: 100%; display: block; }
  .figures { display: flex; flex-direction: column; align-items: flex-end; margin-left: auto; white-space: nowrap; }
  .was { font-size: ${g.wasPt}pt; font-family: "DejaVu Sans Mono", ui-monospace, monospace; color: #333; }
  .price { font-size: ${g.pricePt}pt; font-weight: 700; line-height: 1; font-family: "DejaVu Sans Mono", ui-monospace, monospace; }`;
}

/** The labels as one HTML document at their size: a page each, or 24 to an A4 page. */
export function labelsHtml(size: LabelSize, labels: readonly Label[]): string {
  const cells = eachCopy(labels).map(cell);
  const body =
    size === "A4"
      ? Array.from({ length: Math.ceil(cells.length / A4_PER_PAGE) }, (_, page) =>
          `<section class="sheet">${cells.slice(page * A4_PER_PAGE, (page + 1) * A4_PER_PAGE).join("")}</section>`,
        ).join("\n")
      : cells.join("\n");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Shelf labels</title><style>${css(size)}</style></head><body>${body}</body></html>`;
}

/** The labels as a PDF at their own paper size. */
export async function renderLabelsPdf(size: LabelSize, labels: readonly Label[]): Promise<Uint8Array<ArrayBuffer>> {
  const pdf = await renderPdfFromHtml({
    html: labelsHtml(size, labels),
    template: { ...defaultTemplateSchema, page: { ...defaultTemplateSchema.page, marginMm: 0, orientation: "portrait" } },
  });
  return new Uint8Array(pdf);
}
