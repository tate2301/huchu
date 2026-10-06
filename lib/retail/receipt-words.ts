/**
 * A till receipt as words (SET-07, W-07): what the Receipts page lets a shop
 * write at the top and the bottom, and how a receipt is laid out from those
 * settings and a sale. Browser-safe: the page's live preview, the till's
 * printout and the WhatsApp or email copy are all built here, so the three
 * cannot say different things.
 */

/** 80 mm paper takes 42 characters of the till printer's font on a line. */
export const RECEIPT_LINE_MAX = 42;
/** "Top of the receipt" and "Bottom of the receipt" are each kept to four lines. */
export const RECEIPT_LINES_MAX = 4;

export type ReceiptSendBy = "NOTHING" | "WHATSAPP" | "EMAIL";

/** "Also send by": the stored value and the page's words, in the board's order. */
export const SEND_BY_WORDS: Record<ReceiptSendBy, string> = {
  NOTHING: "Nothing",
  WHATSAPP: "WhatsApp",
  EMAIL: "Email",
};
export const SEND_BY_LABELS = ["Nothing", "WhatsApp", "Email"] as const;

export function sendByOf(label: string): ReceiptSendBy | null {
  const found = (Object.entries(SEND_BY_WORDS) as Array<[ReceiptSendBy, string]>).find(([, words]) => words === label);
  return found ? found[0] : null;
}

/** The text's lines, each trimmed at the end; blank lines at the ends dropped. */
export function receiptTextLines(text: string | null | undefined): string[] {
  const lines = (text ?? "").replace(/\r\n?/g, "\n").split("\n").map((line) => line.trimEnd());
  while (lines.length > 0 && !lines[0]!.trim()) lines.shift();
  while (lines.length > 0 && !lines[lines.length - 1]!.trim()) lines.pop();
  return lines;
}

/** What is wrong with a top or bottom of the receipt, or null: four lines of 42 characters at most. */
export function receiptTextProblem(text: string): string | null {
  const lines = receiptTextLines(text);
  if (lines.length > RECEIPT_LINES_MAX) return `Keep it to ${RECEIPT_LINES_MAX} lines. The till prints each line as typed.`;
  const long = lines.findIndex((line) => line.length > RECEIPT_LINE_MAX);
  if (long >= 0) {
    return `Line ${long + 1} has ${lines[long]!.length} characters. A till receipt fits ${RECEIPT_LINE_MAX} on a line.`;
  }
  return null;
}

/** The settings a till receipt is printed from (10-setup 4.7 `ReceiptWire`). */
export type ReceiptWire = {
  /** The top lines as printed: the shop's own, else its trading name in capitals and the site's address. */
  header: string;
  footer: string;
  showVatNumber: boolean;
  showLicenceNumber: boolean;
  printLogo: boolean;
  copies: 1 | 2;
  alsoSendBy: ReceiptSendBy;
  /** Only while the shop is registered for VAT. */
  vatNumber: string | null;
  /** Only on a liquor store. */
  licenceNumber: string | null;
  logoUrl: string | null;
  liquor: boolean;
};

/** What a receipt says about one sale: its lines, its total, how it was paid and its fiscal day. */
export type ReceiptContent = {
  /** "Castle Lager 340ml x6" / "7.20"; a deposit as its own line under its goods, "Deposit x6". */
  lines: Array<{ label: string; amount: string }>;
  total: string;
  currency: "US$" | "ZiG";
  tenders: Array<{ label: string; amount: string }>;
  /** "FDMS 0441-2209 · Day 214", or null when the sale was not fiscalised. */
  fiscal: string | null;
};

/** A receipt laid out, top to bottom, as every copy of it prints. */
export type ReceiptDoc = {
  /** The first line bold, every line centred. */
  head: string[];
  logoUrl: string | null;
  /** "VAT 10023881", "Licence HRE/BL/2024/0711". */
  numbers: string[];
  lines: Array<{ label: string; amount: string }>;
  total: { label: string; amount: string };
  tenders: Array<{ label: string; amount: string }>;
  foot: string[];
  fiscal: string | null;
};

/** "1,234.50": an amount as a receipt prints it. */
export function receiptAmount(value: number | string): string {
  const number = typeof value === "number" ? value : Number(value);
  const fixed = (Number.isFinite(number) ? number : 0).toFixed(2);
  const [whole, cents] = fixed.split(".");
  return `${whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${cents}`;
}

/** "Castle Lager 340ml x6"; one of a thing is just its name. */
export function receiptLineLabel(name: string, quantity: number): string {
  const shown = Number.isInteger(quantity) ? String(quantity) : String(Number(quantity.toFixed(3)));
  return quantity === 1 ? name : `${name} x${shown}`;
}

/**
 * The receipt, from the settings and a sale: the shop's top lines, the VAT
 * number when it is shown and the shop is registered, the licence number on
 * a liquor store when shown, the lines, the total, how it was paid, the
 * shop's bottom lines and the fiscal day.
 */
export function receiptDoc(wire: ReceiptWire, content: ReceiptContent): ReceiptDoc {
  const numbers: string[] = [];
  if (wire.showVatNumber && wire.vatNumber) numbers.push(`VAT ${wire.vatNumber}`);
  if (wire.liquor && wire.showLicenceNumber && wire.licenceNumber) numbers.push(`Licence ${wire.licenceNumber}`);
  return {
    head: receiptTextLines(wire.header),
    logoUrl: wire.printLogo && wire.logoUrl ? wire.logoUrl : null,
    numbers,
    lines: content.lines,
    total: { label: `TOTAL ${content.currency}`, amount: content.total },
    tenders: content.tenders,
    foot: receiptTextLines(wire.footer),
    fiscal: content.fiscal,
  };
}

/** A line cut at its spaces into parts of `width` at most (a word longer than that is cut). */
function wrap(line: string, width: number): string[] {
  const parts: string[] = [];
  let current = "";
  for (const word of line.split(/\s+/).filter(Boolean)) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= width) {
      current = next;
      continue;
    }
    if (current) parts.push(current);
    current = word;
    while (current.length > width) {
      parts.push(current.slice(0, width));
      current = current.slice(width);
    }
  }
  if (current || parts.length === 0) parts.push(current);
  return parts;
}

/** A label and an amount on one line of `width`, the amount to the right. */
function row(label: string, amount: string, width: number): string {
  const room = width - amount.length - 1;
  const cut = label.length > room ? `${label.slice(0, Math.max(room - 1, 1))}…` : label;
  return `${cut}${" ".repeat(Math.max(width - cut.length - amount.length, 1))}${amount}`;
}

/**
 * The receipt as plain text, for a WhatsApp or an email copy: fixed width,
 * so it reads as the paper does in a monospaced message.
 */
export function receiptText(doc: ReceiptDoc, width = 32): string {
  // A centred line longer than the width wraps at its spaces, each part centred.
  const centre = (line: string): string[] => wrap(line, width).map((part) => {
    const pad = Math.max(Math.floor((width - part.length) / 2), 0);
    return `${" ".repeat(pad)}${part}`.trimEnd();
  });
  const rule = "-".repeat(width);
  const out: string[] = [];
  out.push(...doc.head.flatMap(centre), ...doc.numbers.flatMap(centre), rule);
  out.push(...doc.lines.map((line) => row(line.label, line.amount, width)), rule);
  out.push(row(doc.total.label, doc.total.amount, width), ...doc.tenders.map((line) => row(line.label, line.amount, width)));
  if (doc.foot.length > 0 || doc.fiscal) out.push(rule);
  out.push(...doc.foot.flatMap(centre));
  if (doc.fiscal) out.push(...centre(doc.fiscal));
  return out.join("\n");
}
