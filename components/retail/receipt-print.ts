import type { ReceiptDoc } from "@/lib/retail/receipt-words";

/**
 * Print a receipt on 80 mm paper through the browser's print dialog (SET-07,
 * W-07): the till after a sale, and Setup › Receipts' "Print a test receipt".
 * Each copy is its own page. A till with a built-in printer (Kora,
 * CounterMini) prints from the same dialog; nothing is written to the server.
 */

function escape(text: string): string {
  return text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

const PAPER_CSS = `
@page { size: 80mm auto; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #fff; color: #000; }
body { font-family: 'IBM Plex Mono', ui-monospace, 'SFMono-Regular', Menlo, monospace; font-size: 12px; line-height: 1.45; }
.copy { width: 80mm; padding: 4mm 5mm 6mm; page-break-after: always; break-after: page; }
.copy:last-child { page-break-after: auto; break-after: auto; }
.c { text-align: center; }
.b { font-weight: 700; }
.logo { display: block; margin: 0 auto 2mm; max-width: 40mm; max-height: 18mm; }
.rule { border-top: 1px dashed #000; margin: 2mm 0; }
.row { display: flex; justify-content: space-between; gap: 3mm; }
.row span:first-child { min-width: 0; overflow-wrap: anywhere; }
.row span:last-child { white-space: nowrap; }
.fiscal { margin-top: 2mm; }
`;

/** One copy of the receipt as printable HTML. */
export function receiptCopyHtml(doc: ReceiptDoc): string {
  const row = (line: { label: string; amount: string }, bold = false) =>
    `<div class="row${bold ? " b" : ""}"><span>${escape(line.label)}</span><span>${escape(line.amount)}</span></div>`;
  const parts: string[] = [];
  if (doc.logoUrl) parts.push(`<img class="logo" src="${escape(doc.logoUrl)}" alt="">`);
  doc.head.forEach((line, index) => parts.push(`<div class="c${index === 0 ? " b" : ""}">${escape(line)}</div>`));
  doc.numbers.forEach((line) => parts.push(`<div class="c">${escape(line)}</div>`));
  parts.push('<div class="rule"></div>');
  doc.lines.forEach((line) => parts.push(row(line)));
  parts.push('<div class="rule"></div>');
  parts.push(row(doc.total, true));
  doc.tenders.forEach((line) => parts.push(row(line)));
  if (doc.foot.length > 0 || doc.fiscal) parts.push('<div class="rule"></div>');
  doc.foot.forEach((line) => parts.push(`<div class="c">${escape(line)}</div>`));
  if (doc.fiscal) parts.push(`<div class="c fiscal">${escape(doc.fiscal)}</div>`);
  return `<div class="copy">${parts.join("")}</div>`;
}

/** The whole printout: `copies` pages of the same receipt. */
export function receiptPrintHtml(doc: ReceiptDoc, copies: number): string {
  const pages = Array.from({ length: Math.max(1, Math.min(copies, 2)) }, () => receiptCopyHtml(doc)).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Receipt</title><style>${PAPER_CSS}</style></head><body>${pages}</body></html>`;
}

/**
 * A receipt printed again from the back office (FLR-01), as an 80 mm PDF:
 * the word "COPY" above the header, one page as long as the receipt.
 */
export function receiptCopyPdfHtml(doc: ReceiptDoc): string {
  const rows =
    1 + doc.head.length + doc.numbers.length + doc.lines.length + 1 + doc.tenders.length + doc.foot.length + (doc.fiscal ? 2 : 0);
  const heightMm = Math.ceil(rows * 4.8 + 3 * 4 + 12 + (doc.logoUrl ? 20 : 0));
  const copy = receiptCopyHtml(doc).replace('<div class="copy">', '<div class="copy"><div class="c b">COPY</div>');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Receipt copy</title><style>${PAPER_CSS}
@page { size: 80mm ${heightMm}mm; margin: 0; }</style></head><body>${copy}</body></html>`;
}

/**
 * Open the print dialog with the receipt, from a hidden frame so the page
 * behind it stays as it is. Resolves once the dialog has closed (or at once
 * where the browser does not say).
 */
export function printReceipt(doc: ReceiptDoc, copies: number): Promise<void> {
  return new Promise((resolve) => {
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.tabIndex = -1;
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
    document.body.appendChild(frame);
    const finish = () => {
      window.setTimeout(() => frame.remove(), 500);
      resolve();
    };
    const win = frame.contentWindow;
    if (!win) {
      finish();
      return;
    }
    win.document.open();
    win.document.write(receiptPrintHtml(doc, copies));
    win.document.close();
    const go = () => {
      win.addEventListener("afterprint", finish, { once: true });
      win.focus();
      win.print();
      // Browsers that block in print() have closed the dialog by now; the others say so with afterprint.
      window.setTimeout(finish, 60_000);
    };
    // A logo has to load before it can print.
    const image = win.document.querySelector("img");
    if (image && !image.complete) {
      image.addEventListener("load", go, { once: true });
      image.addEventListener("error", go, { once: true });
    } else {
      go();
    }
  });
}
