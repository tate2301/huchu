import { formatCount } from "@/lib/workspace/format";

import type { LabelSize } from "./data";

/**
 * Shelf labels' words (PRD-06), shared by the sheet, the server's answers and
 * Activity. Imports no server code.
 */

export const COPIES_MESSAGE = "Copies is 1 to 50.";
export const SHOW_MESSAGE = "Show at least a price or a barcode.";
/** One print holds at most this many labels, products times copies. */
export const MAX_LABELS = 2000;
export const TOO_MANY_MESSAGE = `Print at most ${formatCount(MAX_LABELS)} labels at a time: tick fewer products or lower the copies.`;
export const A4_ON_TILL_MESSAGE = "A4 sheets print here, not on a till printer.";

/** "Print here": this computer's own printer, through a PDF. */
export const PRINT_HERE = { id: "here", label: "Print here", sub: "This computer, any printer" };

/** What one of each size is called, and many. */
export const LABEL_SIZE_WORDS: Record<LabelSize, [one: string, many: string]> = {
  STRIP: ["shelf strip", "shelf strips"],
  TAG: ["price tag", "price tags"],
  A4: ["label on an A4 sheet", "labels on A4 sheets"],
};

/** "1 label", "4 labels". */
export const labelCount = (count: number) => `${formatCount(count)} ${count === 1 ? "label" : "labels"}`;

/** "Front till printer": a till's printer is called after the till. */
export const printerName = (tillName: string) => `${tillName} printer`;

/** A till's printer inside a sentence: "the front till printer". */
const thePrinter = (printer: string) => `the ${printer.charAt(0).toLowerCase()}${printer.slice(1)}`;

/** Where a print went, inside a sentence: "on the front till printer", "here". */
export function printedWhere(printer: string): string {
  return printer === "here" ? "here" : `on ${thePrinter(printer)}`;
}

/** What the toast adds about products that did not print as asked: "Not printed: 1 product not found. No price: Rice 2kg." */
export function labelsLeftOut(printed: { unpriced?: string[]; notFound?: number }): string {
  const unpriced = printed.unpriced ?? [];
  const notFound = printed.notFound ?? 0;
  const parts: string[] = [];
  if (notFound > 0) parts.push(`${formatCount(notFound)} ${notFound === 1 ? "product was" : "products were"} not found and left out.`);
  if (unpriced.length > 0) {
    const shown = unpriced.slice(0, 3).join(", ");
    parts.push(`No price on the default list: ${shown}${unpriced.length > 3 ? ` and ${formatCount(unpriced.length - 3)} more` : ""}.`);
  }
  return parts.join(" ");
}

/** The toast: "4 labels sent to the front till printer." / "4 labels ready to print.", then what was left out. */
export function labelsDoneSentence(printed: { count: number; printer: string; unpriced?: string[]; notFound?: number }): string {
  const { count, printer } = printed;
  const sentence = printer === "here" ? `${labelCount(count)} ready to print.` : `${labelCount(count)} sent to ${thePrinter(printer)}.`;
  return [sentence, labelsLeftOut(printed)].filter(Boolean).join(" ");
}

/** Activity, one product: "Printed 1 shelf strip on the front till printer", "Printed 2 price tags here". */
export function labelsPrintedSentence(payload: { size?: unknown; copies?: unknown; printer?: unknown }): string {
  const size = (typeof payload.size === "string" && payload.size in LABEL_SIZE_WORDS ? payload.size : "STRIP") as LabelSize;
  const copies = typeof payload.copies === "number" ? payload.copies : 1;
  const printer = typeof payload.printer === "string" ? payload.printer : "here";
  const [one, many] = LABEL_SIZE_WORDS[size];
  return `Printed ${formatCount(copies)} ${copies === 1 ? one : many} ${printedWhere(printer)}`;
}
