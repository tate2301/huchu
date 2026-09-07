import type { CrmDocumentLineInput } from "../../accounting-bridge";

export type DocumentLineDraft = {
  description: string;
  quantity: string;
  unitPrice: string;
  discountPercent: string;
  taxRate: string;
};

export function emptyLine(): DocumentLineDraft {
  return { description: "", quantity: "1", unitPrice: "", discountPercent: "", taxRate: "" };
}

export function toNumber(raw: string, fallback = 0): number {
  const parsed = Number(raw.trim());
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function clampPercent(value: number): number {
  return Math.min(Math.max(value, 0), 100);
}

/**
 * Turn a draft row into the line the API accepts.
 *
 * Both the per-line and the document-level discount land on the unit price. A
 * separate negative "discount" line would be rejected — the accounting line
 * schema requires a non-negative unit price, and relaxing that would let a
 * document total go negative. The discount is named in the description so the
 * client's copy says what they were given.
 */
export function draftToLine(
  line: DocumentLineDraft,
  documentDiscountPercent = 0,
): CrmDocumentLineInput | null {
  const description = line.description.trim();
  const quantity = toNumber(line.quantity, 1);
  if (!description || quantity <= 0) return null;

  const listPrice = toNumber(line.unitPrice);
  const lineDiscount = clampPercent(toNumber(line.discountPercent));
  const docDiscount = clampPercent(documentDiscountPercent);
  const unitPrice = round2(listPrice * (1 - lineDiscount / 100) * (1 - docDiscount / 100));
  const taxRate = line.taxRate.trim() ? toNumber(line.taxRate) : undefined;

  const notes: string[] = [];
  if (lineDiscount > 0) notes.push(`${lineDiscount}% discount`);
  if (docDiscount > 0) notes.push(`${docDiscount}% document discount`);

  return {
    description: notes.length > 0 ? `${description} (${notes.join(", ")} applied)` : description,
    quantity,
    unitPrice,
    ...(taxRate ? { taxRate } : {}),
  };
}

export type DocumentTotals = {
  listTotal: number;
  lineDiscount: number;
  docDiscountAmount: number;
  subTotal: number;
  taxTotal: number;
  total: number;
};

/**
 * The totals ladder shown while building a document. Tax follows the
 * discounted base — charging tax on the pre-discount price would quietly
 * overcharge the client.
 */
export function lineTotals(
  lines: DocumentLineDraft[],
  documentDiscountPercent: number,
): DocumentTotals {
  let listTotal = 0;
  let subTotal = 0;
  let taxTotal = 0;

  for (const line of lines) {
    const quantity = toNumber(line.quantity, 1);
    if (!line.description.trim() || quantity <= 0) continue;
    const listPrice = toNumber(line.unitPrice);
    const discount = clampPercent(toNumber(line.discountPercent));
    const net = quantity * round2(listPrice * (1 - discount / 100));
    listTotal += quantity * listPrice;
    subTotal += net;
    taxTotal += (net * toNumber(line.taxRate)) / 100;
  }

  const docDiscount = clampPercent(documentDiscountPercent);
  const docDiscountAmount = round2((subTotal * docDiscount) / 100);
  const netSubTotal = round2(subTotal - docDiscountAmount);
  const scale = subTotal > 0 ? netSubTotal / subTotal : 1;
  const netTax = round2(taxTotal * scale);

  return {
    listTotal: round2(listTotal),
    lineDiscount: round2(listTotal - subTotal),
    docDiscountAmount,
    subTotal: netSubTotal,
    taxTotal: netTax,
    total: round2(netSubTotal + netTax),
  };
}
