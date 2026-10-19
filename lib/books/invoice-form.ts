/**
 * Books → Sales → New invoice (design/core-modules/boards/view/BkInvoiceNew.html):
 * the form's sums and its checks, the same in the browser and on the server.
 * Pure, so the page imports it and a test walks it.
 */

export type InvoiceFormLine = {
  description: string;
  quantity: string;
  unitPrice: string;
  taxCodeId: string;
};

export type InvoiceForm = {
  customerId: string;
  currency: string;
  invoiceDate: string;
  /** Days after the invoice date, or "" for no due date. */
  dueInDays: string;
  costCenterId: string;
  notes: string;
  lines: InvoiceFormLine[];
  /** Paid at the counter: issue it and record the payment into this account in one go (books-final §5.1, cash sale). */
  paidNow: boolean;
  paidInto: string;
  quotationId?: string | null;
};

export type TaxCodeOption = { id: string; label: string; rate: number };

const cents = (n: number) => Math.round(n * 100) / 100;

/** "82", "82 m²", "1,250.50" → the number in it, or NaN. */
export function readNumber(text: string): number {
  const match = text.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : Number.NaN;
}

export function lineNet(line: InvoiceFormLine): number {
  const quantity = readNumber(line.quantity);
  const price = readNumber(line.unitPrice);
  return Number.isFinite(quantity) && Number.isFinite(price) ? cents(quantity * price) : 0;
}

/** Before VAT, the VAT, and the total, with each line's tax from its code. */
export function formTotals(lines: InvoiceFormLine[], codes: TaxCodeOption[]): { net: number; tax: number; total: number; rates: number[] } {
  let net = 0;
  let tax = 0;
  const rates = new Set<number>();
  for (const line of lines) {
    const amount = lineNet(line);
    const rate = codes.find((code) => code.id === line.taxCodeId)?.rate ?? 0;
    if (line.taxCodeId) rates.add(rate);
    net += amount;
    tax += (amount * rate) / 100;
  }
  return { net: cents(net), tax: cents(tax), total: cents(net + tax), rates: [...rates] };
}

/** The due date `days` after the invoice date, as YYYY-MM-DD. */
export function dueDate(invoiceDate: string, days: string): string | null {
  const n = Number(days);
  if (!invoiceDate || !days || !Number.isFinite(n)) return null;
  const date = new Date(`${invoiceDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + n);
  return date.toISOString().slice(0, 10);
}

/** What is wrong with the form, by field, in plain words. Empty when it can go. */
export function invoiceFormErrors(form: InvoiceForm, intent: "draft" | "issue"): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!form.customerId) errors.customerId = "Choose who the invoice is to.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.invoiceDate)) errors.invoiceDate = "Give the invoice a date.";
  const lines = form.lines.filter((line) => line.description.trim() || line.quantity.trim() || line.unitPrice.trim());
  if (lines.length === 0) errors.lines = "Add at least one line.";
  form.lines.forEach((line, index) => {
    const touched = line.description.trim() || line.quantity.trim() || line.unitPrice.trim();
    if (!touched) return;
    if (!line.description.trim()) errors[`lines.${index}.description`] = "Say what this line is for.";
    const quantity = readNumber(line.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) errors[`lines.${index}.quantity`] = "More than nothing.";
    const price = readNumber(line.unitPrice);
    if (!Number.isFinite(price) || price < 0) errors[`lines.${index}.unitPrice`] = "A price, nought or more.";
  });
  if (intent === "issue" && form.paidNow && !form.paidInto) errors.paidInto = "Say which account the money went into.";
  return errors;
}

/** The body `POST /api/books/invoices` takes. Empty lines are left out. */
export function invoicePayload(form: InvoiceForm, intent: "draft" | "issue") {
  const due = dueDate(form.invoiceDate, form.dueInDays);
  return {
    customerId: form.customerId,
    currency: form.currency,
    invoiceDate: form.invoiceDate,
    ...(due ? { dueDate: due } : {}),
    ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
    ...(form.costCenterId ? { costCenterId: form.costCenterId } : {}),
    ...(form.quotationId ? { quotationId: form.quotationId } : {}),
    issueNow: intent === "issue",
    ...(intent === "issue" && form.paidNow && form.paidInto ? { paidNow: { bankAccountId: form.paidInto } } : {}),
    lines: form.lines
      .filter((line) => line.description.trim())
      .map((line) => ({
        description: line.description.trim(),
        quantity: readNumber(line.quantity),
        unitPrice: readNumber(line.unitPrice),
        ...(line.taxCodeId ? { taxCodeId: line.taxCodeId } : {}),
      })),
  };
}
