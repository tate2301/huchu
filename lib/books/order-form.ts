/**
 * Books → Purchase orders → New order: the form's checks and the body it sends
 * to `POST /api/books/purchase-orders` (D11: no shop needed, service lines
 * allowed). Pure.
 */
import { readNumber } from "./invoice-form";

export type OrderFormLine = { itemName: string; quantity: string; unitCost: string; vatRate: string };
export type OrderForm = { vendorId: string; expectedDate: string; note: string; lines: OrderFormLine[] };

const filled = (line: OrderFormLine) => Boolean(line.itemName.trim() || line.unitCost.trim());

export function orderFormErrors(form: OrderForm): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!form.vendorId) errors.vendorId = "Choose who it is ordered from.";
  if (form.expectedDate && !/^\d{4}-\d{2}-\d{2}$/.test(form.expectedDate)) errors.expectedDate = "A day, or leave it empty.";
  const lines = form.lines.filter(filled);
  if (lines.length === 0) errors.lines = "Add at least one line.";
  form.lines.forEach((line, index) => {
    if (!filled(line)) return;
    if (!line.itemName.trim()) errors[`lines.${index}.itemName`] = "Say what is ordered.";
    const quantity = readNumber(line.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) errors[`lines.${index}.quantity`] = "More than nothing.";
    const cost = readNumber(line.unitCost);
    if (!Number.isFinite(cost) || cost < 0) errors[`lines.${index}.unitCost`] = "A price, nought or more.";
  });
  return errors;
}

/** Before VAT, VAT and the total, as the rail shows them. */
export function orderTotals(lines: OrderFormLine[]): { net: number; tax: number; total: number } {
  let net = 0;
  let tax = 0;
  for (const line of lines.filter(filled)) {
    const amount = (readNumber(line.quantity) || 0) * (readNumber(line.unitCost) || 0);
    net += amount;
    tax += (amount * (Number(line.vatRate) || 0)) / 100;
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  return { net: round(net), tax: round(tax), total: round(net + tax) };
}

export function orderPayload(form: OrderForm) {
  return {
    vendorId: form.vendorId,
    expectedDate: form.expectedDate || null,
    noteToSupplier: form.note.trim() || null,
    lines: form.lines.filter(filled).map((line) => ({ itemName: line.itemName.trim(), quantity: readNumber(line.quantity), unitCost: readNumber(line.unitCost), vatRate: Number(line.vatRate) || 0 })),
  };
}
